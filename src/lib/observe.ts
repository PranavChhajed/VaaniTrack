import postgres from "postgres";

/**
 * The observability layer: server side only.
 *
 * Its purpose is not storage. It is being able to answer, for one wrong
 * expense: **where in the pipeline did this break?**
 *
 *   audio → ASR → transcript → extraction → confidence gate → user action
 *
 * Storing only the final transaction says what happened, never where it went
 * wrong. Each stage is recorded separately so the stages can be blamed
 * independently.
 *
 * ## The rule that governs every function here
 *
 * **Diagnostics must never take down the capture path.** A user speaking an
 * expense must not fail because a logging table is unreachable. Every function
 * swallows its own errors and returns a degraded-but-safe value. A missing row
 * costs us a data point; a thrown error costs the user their transaction.
 */

const CONNECTION = process.env.DATABASE_URL;

/**
 * One pooled client per process, created lazily.
 *
 * `max: 1` because serverless instances are numerous and short-lived; a
 * larger pool per instance multiplies into far more Postgres connections than
 * intended. `prepare: false` is required by Supabase's transaction pooler,
 * which cannot carry prepared statements across pooled connections.
 */
let sql: postgres.Sql | null = null;
let unavailable = false;

function db(): postgres.Sql | null {
  if (unavailable) return null;
  if (sql) return sql;
  if (!CONNECTION) {
    unavailable = true;
    return null;
  }
  try {
    sql = postgres(CONNECTION, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    } as postgres.Options<Record<string, never>>);
    return sql;
  } catch {
    unavailable = true;
    return null;
  }
}

export type AsrVerdict =
  | "accepted"
  | "rejected_too_small"
  | "rejected_no_speech"
  | "rejected_denylist"
  | "rejected_no_amount"
  | "skipped_typed"
  | "error";

export type GateOutcome = "auto_saved" | "review";

export type UserAction =
  | "auto_saved"
  | "review_saved"
  | "review_discarded"
  | "undone"
  | "edited"
  | "deleted";

/** A device_id we can't parse is worse than none: it would poison grouping. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validDeviceId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/**
 * Stage 1: record the utterance and what the transcriber made of it.
 *
 * Returns the capture id so the client can thread it through to extraction,
 * or null when logging is unavailable, in which case the pipeline simply runs
 * unobserved rather than failing.
 */
export async function recordCapture(row: {
  deviceId: string | null;
  source: "voice" | "manual";
  audioMime?: string | null;
  audioBytes?: number | null;
  audioMs?: number | null;
  /** dBFS as measured in the browser, where the PCM still exists. The server
   *  only ever sees Opus, which spends its bitrate on silence and speech
   *  alike, so without these a silent capture is indistinguishable from a
   *  good one right up until the transcript comes back wrong. */
  audioPeakDb?: number | null;
  audioMeanDb?: number | null;
  audioWarmupMs?: number | null;
  asrModel?: string | null;
  transcript?: string | null;
  asrVerdict?: AsrVerdict | null;
  asrReason?: string | null;
  avgLogprob?: number | null;
  noSpeechProb?: number | null;
}): Promise<string | null> {
  const s = db();
  if (!s || !row.deviceId) return null;
  try {
    const [out] = await s`
      insert into captures ${s({
        device_id: row.deviceId,
        source: row.source,
        audio_mime: row.audioMime ?? null,
        audio_bytes: row.audioBytes ?? null,
        audio_ms: row.audioMs ?? null,
        audio_peak_db: row.audioPeakDb ?? null,
        audio_mean_db: row.audioMeanDb ?? null,
        audio_warmup_ms: row.audioWarmupMs ?? null,
        asr_model: row.asrModel ?? null,
        transcript: row.transcript ?? null,
        asr_verdict: row.asrVerdict ?? null,
        asr_reason: row.asrReason ?? null,
        avg_logprob: row.avgLogprob ?? null,
        no_speech_prob: row.noSpeechProb ?? null,
      })}
      returning id
    `;
    return out?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Stage 2: attach what the extractor made of the transcript.
 *
 * The raw model output is stored verbatim, not just the parsed fields: when
 * extraction is the thing that went wrong, the parsed view is the very thing
 * under suspicion.
 */
export async function recordExtraction(
  captureId: string,
  row: {
    model: string;
    raw: unknown;
    error?: string | null;
    ms?: number | null;
  },
): Promise<void> {
  const s = db();
  if (!s) return;
  try {
    await s`
      update captures set
        extract_model = ${row.model},
        extract_raw   = ${s.json(row.raw as never)},
        extract_error = ${row.error ?? null},
        extract_ms    = ${row.ms ?? null}
      where id = ${captureId}
    `;
  } catch {
    /* diagnostics never break capture */
  }
}

/**
 * The confidence gate's verdict, per extracted transaction.
 *
 * `gateFailed` is the point of this table. The gate is four independent
 * conditions, and "why did this go to review?" is unanswerable from a single
 * score; it needs to name which condition blocked the save.
 */
export async function recordGate(
  captureId: string,
  rows: {
    idx: number;
    transactionId: string | null;
    extracted: unknown;
    outcome: GateOutcome;
    failed: string[];
  }[],
): Promise<void> {
  const s = db();
  if (!s || rows.length === 0) return;
  try {
    await s`
      insert into capture_transactions ${s(
        rows.map((r) => ({
          capture_id: captureId,
          idx: r.idx,
          transaction_id: r.transactionId,
          extracted: s.json(r.extracted as never),
          gate_outcome: r.outcome,
          gate_failed: r.failed,
        })) as never,
      )}
      on conflict (capture_id, idx) do nothing
    `;
  } catch {
    /* diagnostics never break capture */
  }
}

/**
 * What the user did about it.
 *
 * Undo, edit and delete each destroy evidence in the app's own storage, so
 * this row is written before that happens. `beforeState` preserves the model's
 * original output: without it a correction can be seen but not compared
 * against what was proposed, which is the entire value of a correction.
 */
export async function recordEvent(row: {
  captureId?: string | null;
  transactionId?: string | null;
  deviceId: string | null;
  action: UserAction;
  before?: unknown;
  after?: unknown;
  changedFields?: string[];
}): Promise<void> {
  const s = db();
  if (!s || !row.deviceId) return;
  try {
    await s`
      insert into capture_events ${s({
        capture_id: row.captureId ?? null,
        transaction_id: row.transactionId ?? null,
        device_id: row.deviceId,
        action: row.action,
        before_state: row.before === undefined ? null : s.json(row.before as never),
        after_state: row.after === undefined ? null : s.json(row.after as never),
        changed_fields: row.changedFields ?? null,
      })}
    `;
  } catch {
    /* diagnostics never break capture */
  }
}

/** Read side, for the diagnostic portal. */
export async function listCaptures(limit = 50) {
  const s = db();
  if (!s) return [];
  try {
    return await s`
      select
        c.id, c.created_at, c.source, c.transcript,
        c.asr_verdict, c.asr_reason, c.audio_bytes, c.audio_ms,
        c.audio_peak_db, c.audio_mean_db, c.audio_warmup_ms,
        c.avg_logprob, c.no_speech_prob,
        c.extract_error, c.device_id,
        coalesce(
          json_agg(
            json_build_object(
              'idx', t.idx,
              'extracted', t.extracted,
              'outcome', t.gate_outcome,
              'failed', t.gate_failed,
              'transactionId', t.transaction_id
            ) order by t.idx
          ) filter (where t.id is not null),
          '[]'
        ) as transactions
      from captures c
      left join capture_transactions t on t.capture_id = c.id
      group by c.id
      order by c.created_at desc
      limit ${limit}
    `;
  } catch {
    return [];
  }
}

/** Everything known about one capture, for the pipeline view. */
export async function getCapture(id: string) {
  const s = db();
  if (!s) return null;
  try {
    const [capture] = await s`select * from captures where id = ${id}`;
    if (!capture) return null;
    const transactions = await s`
      select * from capture_transactions where capture_id = ${id} order by idx
    `;
    const events = await s`
      select * from capture_events where capture_id = ${id} order by at
    `;
    return { capture, transactions, events };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Transaction mirror
 *
 * localStorage stays the fast local cache; this is the durable copy, keyed by
 * the anonymous device id. No accounts, no cross-device sync; the brief warns
 * against turning this into an authentication project, and durability alone is
 * what was actually missing.
 * ------------------------------------------------------------------ */

export async function upsertTransaction(row: {
  id: string;
  deviceId: string | null;
  captureId?: string | null;
  data: unknown;
  amount?: number | null;
  date?: string | null;
}): Promise<void> {
  const s = db();
  if (!s || !row.deviceId) return;
  try {
    await s`
      insert into transactions ${s({
        id: row.id,
        device_id: row.deviceId,
        capture_id: row.captureId ?? null,
        data: s.json(row.data as never),
        amount: row.amount ?? null,
        txn_date: row.date ?? null,
      })}
      on conflict (id) do update set
        data       = excluded.data,
        amount     = excluded.amount,
        txn_date   = excluded.txn_date,
        capture_id = coalesce(transactions.capture_id, excluded.capture_id),
        updated_at = now(),
        deleted_at = null
    `;
  } catch {
    /* diagnostics never break capture */
  }
}

/**
 * Soft delete.
 *
 * A deleted transaction is evidence about where trust broke, so the row
 * survives the user removing it from their journal. `deleted_at` is what makes
 * it invisible to the app while still answerable to the portal.
 */
export async function markTransactionDeleted(
  id: string,
  deviceId: string | null,
): Promise<void> {
  const s = db();
  if (!s || !deviceId) return;
  try {
    await s`
      update transactions set deleted_at = now(), updated_at = now()
      where id = ${id} and device_id = ${deviceId}
    `;
  } catch {
    /* diagnostics never break capture */
  }
}

/** The durable copy of a device's journal, newest first. */
export async function listTransactions(deviceId: string, limit = 1000) {
  const s = db();
  if (!s) return [];
  try {
    return await s`
      select data from transactions
      where device_id = ${deviceId} and deleted_at is null
      order by txn_date desc nulls last, created_at desc
      limit ${limit}
    `;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ *
 * Audio retention
 * ------------------------------------------------------------------ */

/** Consented recordings live 90 days: long enough to span several prompt and
 *  model iterations, short enough to remain a policy rather than a hoard. */
export const AUDIO_RETENTION_DAYS = 90;

const STORAGE_BUCKET = "captures";

/**
 * Put a consented recording in Supabase Storage.
 *
 * Uses the storage REST endpoint directly rather than adding a second client
 * library for one upload. Returns the object path, or null if anything at all
 * went wrong: an unstored recording is a lost data point, never a failed
 * capture.
 */
export async function storeAudio(
  captureId: string,
  bytes: ArrayBuffer,
  mime: string,
): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) return null;

  const path = `${captureId}.${mime.includes("mp4") ? "mp4" : "webm"}`;
  // Browsers report "audio/webm;codecs=opus", but the bucket's allowlist
  // matches on the bare type and rejects the codec parameter outright with a
  // 415. Every consented recording was being silently dropped because of it,
  // consent recorded as given, audio_stored false, no error anywhere.
  const bucketMime = mime.split(";")[0].trim() || "application/octet-stream";
  try {
    const res = await fetch(`${base}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": bucketMime,
      },
      body: bytes,
    });
    if (!res.ok) {
      // Swallowing this quietly is what let every consented recording vanish
      // while the row cheerfully reported consent=true, stored=false. Failing
      // silently is still right for the user's capture; failing invisibly to
      // the operator is not.
      console.warn(
        `[storeAudio] ${res.status} for ${path} (${bucketMime}): ${await res
          .text()
          .catch(() => "")}`,
      );
      return null;
    }
    return path;
  } catch (err) {
    console.warn(`[storeAudio] threw for ${path}: ${String(err)}`);
    return null;
  }
}

/** Record what was decided about this capture's audio, stored or not. */
export async function recordAudioDecision(
  captureId: string,
  row: { consent: boolean; path: string | null },
): Promise<void> {
  const s = db();
  if (!s) return;
  try {
    await s`
      update captures set
        audio_consent    = ${row.consent},
        audio_stored     = ${row.path !== null},
        audio_path       = ${row.path},
        audio_expires_at = ${
          row.path
            ? new Date(Date.now() + AUDIO_RETENTION_DAYS * 86_400_000)
            : null
        }
      where id = ${captureId}
    `;
  } catch {
    /* diagnostics never break capture */
  }
}

/**
 * Captures whose consented recording has outlived AUDIO_RETENTION_DAYS and is
 * still marked stored. The purge cron's work list.
 */
export async function listExpiredAudio(
  limit = 200,
): Promise<{ id: string; path: string }[]> {
  const s = db();
  if (!s) return [];
  try {
    return await s<{ id: string; path: string }[]>`
      select id, audio_path as path
      from captures
      where audio_stored = true
        and audio_path is not null
        and audio_expires_at is not null
        and audio_expires_at < now()
      limit ${limit}
    `;
  } catch {
    return [];
  }
}

/**
 * Delete a stored recording from Supabase Storage.
 *
 * A 404 counts as success: the object is already gone, which is the state
 * this call is trying to reach either way.
 */
export async function deleteStoredAudio(path: string): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) return false;
  try {
    const res = await fetch(
      `${base}/storage/v1/object/${STORAGE_BUCKET}/${path}`,
      {
        method: "DELETE",
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok && res.status !== 404) {
      console.warn(`[deleteStoredAudio] ${res.status} for ${path}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[deleteStoredAudio] threw for ${path}: ${String(err)}`);
    return false;
  }
}

/** Record that a capture's audio has been purged. The row itself persists. */
export async function markAudioPurged(captureId: string): Promise<void> {
  const s = db();
  if (!s) return;
  try {
    await s`
      update captures set audio_stored = false, audio_path = null
      where id = ${captureId}
    `;
  } catch {
    /* diagnostics never break capture */
  }
}

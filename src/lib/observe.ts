import postgres from "postgres";

/**
 * The observability layer — server side only.
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
 * `max: 1` because serverless instances are numerous and short-lived — a
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

/** A device_id we can't parse is worse than none — it would poison grouping. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validDeviceId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/**
 * Stage 1 — record the utterance and what the transcriber made of it.
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
 * Stage 2 — attach what the extractor made of the transcript.
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
 * score — it needs to name which condition blocked the save.
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
 * original output — without it a correction can be seen but not compared
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
        c.asr_verdict, c.avg_logprob, c.no_speech_prob,
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

/**
 * Replay real captures through candidate pipeline settings.
 *
 *   npx tsx --env-file=.env.local scripts/replay.ts asr
 *   npx tsx --env-file=.env.local scripts/replay.ts extract
 *
 * Tuning against synthesised speech is tuning against the wrong distribution,
 * so this uses the only corpus that can answer "does this change help":
 * the consented recordings in Supabase Storage and the transcripts beside
 * them, scored against what the user went on to keep.
 *
 * Nobody labelled anything by hand. The truth for a clip comes from the
 * journal's own history:
 *
 *   kept     the capture's transactions were never undone, deleted or
 *            corrected, so what was extracted from it is what was said.
 *   retried  the capture was rejected, undone or deleted, and the same device
 *            recorded again within two minutes and kept that one. The retry is
 *            what the first take was trying to say.
 *   silence  rejected, and nobody tried again. Nothing was said; a candidate
 *            passes only by rejecting it too.
 *
 * Audio is cached under .captures/replay/, which is gitignored. Results land
 * there as JSON; the summary prints to stdout.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { transcribeAudio } from "../src/lib/asr.ts";
import { extractTransactions } from "../src/lib/extract.ts";
import { buildVocab } from "./replay-vocab.ts";
import type { ExtractedTransaction, Transaction } from "../src/lib/types.ts";

const OUT = join(process.cwd(), ".captures", "replay");
const RETRY_WINDOW_MS = 120_000;

const apiKey = process.env.GROQ_API_KEY ?? "";
const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1, prepare: false });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/** Every amount written in a transcript, with "2K" read as 2000. */
function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s?(k\b)?/gi)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(m[2] ? n * 1000 : n);
  }
  return out;
}

function wordsOf(text: string | null): string[] {
  return (text ?? "")
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length > 2);
}

type CaptureRow = {
  id: string;
  device_id: string;
  created_at: Date;
  audio_path: string | null;
  audio_mime: string | null;
  transcript: string | null;
  asr_verdict: string | null;
  extract_raw: { transactions?: ExtractedTransaction[] } | null;
  extracted: ExtractedTransaction[];
  /** True when any of its transactions was undone, deleted, discarded, or had
   *  its amount or description corrected. */
  reversed: boolean;
};

async function loadCaptures(): Promise<CaptureRow[]> {
  return sql<CaptureRow[]>`
    select
      c.id, c.device_id, c.created_at, c.audio_path, c.audio_mime,
      c.transcript, c.asr_verdict, c.extract_raw,
      coalesce(
        (select json_agg(t.extracted order by t.idx)
           from capture_transactions t where t.capture_id = c.id),
        '[]'
      ) as extracted,
      exists (
        select 1 from capture_events e
        where (e.capture_id = c.id or e.transaction_id in (
                 select transaction_id from capture_transactions t
                 where t.capture_id = c.id and t.transaction_id is not null))
          and (e.action in ('undone', 'deleted', 'review_discarded')
               or (e.action in ('edited', 'review_saved')
                   and e.changed_fields && array['amount', 'description']))
      ) as reversed
    from captures c
    order by c.created_at
  `;
}

type Truth =
  | { kind: "kept" | "retried"; amounts: number[]; words: string[]; from: string }
  | { kind: "silence" }
  | { kind: "unknown" };

const isKept = (c: CaptureRow) =>
  c.asr_verdict === "accepted" && c.extracted.length > 0 && !c.reversed;

function spoken(c: CaptureRow, kind: "kept" | "retried"): Truth {
  return {
    kind,
    amounts: c.extracted.map((e) => e.amount).filter((n): n is number => n !== null),
    words: c.extracted.flatMap((e) => wordsOf(e.description)),
    from: c.transcript ?? "",
  };
}

function truthFor(c: CaptureRow, all: CaptureRow[]): Truth {
  if (isKept(c)) return spoken(c, "kept");

  const at = c.created_at.getTime();
  const retry = all.find(
    (o) =>
      o.device_id === c.device_id &&
      o.created_at.getTime() > at &&
      o.created_at.getTime() - at <= RETRY_WINDOW_MS &&
      isKept(o),
  );
  if (retry) return spoken(retry, "retried");

  return c.asr_verdict?.startsWith("rejected") ? { kind: "silence" } : { kind: "unknown" };
}

async function audioFor(c: CaptureRow): Promise<ArrayBuffer | null> {
  if (!c.audio_path) return null;
  const cached = join(OUT, "audio", c.audio_path);
  try {
    const buf = await readFile(cached);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch {
    /* not cached yet */
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  const res = await fetch(`${base}/storage/v1/object/captures/${c.audio_path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  const bytes = await res.arrayBuffer();
  await writeFile(cached, Buffer.from(bytes));
  return bytes;
}

/* ------------------------------------------------------------------ *
 * asr: stored recordings through each transcription setup
 * ------------------------------------------------------------------ */

const ASR_CONFIGS = [
  { name: "v3", model: "whisper-large-v3", vocab: false },
  { name: "v3+vocab", model: "whisper-large-v3", vocab: true },
  { name: "turbo", model: "whisper-large-v3-turbo", vocab: false },
  { name: "turbo+vocab", model: "whisper-large-v3-turbo", vocab: true },
];

async function replayAsr() {
  const all = await loadCaptures();
  const clips = all.filter((c) => c.audio_path);

  const journal = await sql<{ device_id: string; created_at: Date; data: Transaction }[]>`
    select device_id, created_at, data from transactions where deleted_at is null
  `;

  const rows: Record<string, unknown>[] = [];
  const tally = new Map<string, { ms: number[]; [k: string]: number | number[] }>();
  const bump = (config: string, key: string) => {
    const t = tally.get(config)!;
    t[key] = ((t[key] as number) ?? 0) + 1;
  };
  for (const cfg of ASR_CONFIGS) tally.set(cfg.name, { ms: [] });

  for (const [i, c] of clips.entries()) {
    const bytes = await audioFor(c);
    if (!bytes) continue;
    const truth = truthFor(c, all);
    // Only what the journal held before this take was recorded: a hint list
    // that already contains the word under test would be marking its own
    // homework.
    const vocab = buildVocab(
      journal
        .filter((t) => t.device_id === c.device_id && t.created_at < c.created_at)
        .map((t) => t.data),
    );

    const row: Record<string, unknown> = {
      id: c.id,
      at: c.created_at.toISOString(),
      original: { verdict: c.asr_verdict, transcript: c.transcript, reversed: c.reversed },
      truth,
      vocab,
    };

    for (const cfg of ASR_CONFIGS) {
      let result = await transcribeAudio(bytes, c.audio_mime ?? "audio/webm", {
        apiKey,
        model: cfg.model,
        vocab: cfg.vocab ? vocab : [],
      });
      for (let tries = 0; result.kind === "error" && tries < 6; tries++) {
        await sleep(result.status === 429 ? 20_000 : 3_000);
        result = await transcribeAudio(bytes, c.audio_mime ?? "audio/webm", {
          apiKey,
          model: cfg.model,
          vocab: cfg.vocab ? vocab : [],
        });
      }
      if (result.kind === "error") {
        row[cfg.name] = { error: result.error };
        bump(cfg.name, "errors");
        continue;
      }

      tally.get(cfg.name)!.ms.push(result.ms);
      const heard = numbersIn(result.text);
      let pass: boolean | null = null;
      let wordHits: number | null = null;

      if (truth.kind === "silence") {
        pass = result.kind === "rejected";
        bump(cfg.name, pass ? "silence_ok" : "silence_BROKEN");
      } else if (truth.kind === "kept" || truth.kind === "retried") {
        const amountsOk =
          result.kind === "accepted" && truth.amounts.every((n) => heard.includes(n));
        const said = new Set(wordsOf(result.text));
        wordHits = truth.words.filter((w) => said.has(w)).length;
        const wordsOk = wordHits === truth.words.length;
        pass = amountsOk && wordsOk;
        bump(cfg.name, `${truth.kind}_${pass ? "ok" : amountsOk ? "words_wrong" : "amount_wrong"}`);
      }

      row[cfg.name] = {
        kind: result.kind,
        text: result.text,
        logprob: result.avgLogprob === null ? null : Number(result.avgLogprob.toFixed(3)),
        ms: result.ms,
        pass,
        wordHits,
      };
      await sleep(700);
    }

    rows.push(row);
    console.log(`[${i + 1}/${clips.length}] ${truth.kind.padEnd(8)} ${c.transcript ?? "(none)"}`);
  }

  await writeFile(join(OUT, "asr.json"), JSON.stringify(rows, null, 2));
  console.log("\n=== ASR summary ===");
  for (const [name, t] of tally) {
    const { ms, ...counts } = t;
    console.log(
      name.padEnd(12),
      `p50 ${percentile(ms, 0.5)}ms  p90 ${percentile(ms, 0.9)}ms `,
      JSON.stringify(counts),
    );
  }
}

/* ------------------------------------------------------------------ *
 * extract: stored transcripts through each extraction setup
 * ------------------------------------------------------------------ */

// The free tier allows 8,000 tokens a minute on the key production also
// uses, and one extraction is about a thousand. So this runs one candidate at
// a time, against what production already returned for the same transcript,
// and takes a sample (`replay.ts extract 40`) rather than everything.
const EXTRACT_CONFIGS: {
  name: string;
  model: string;
  effort: "low" | "medium" | "high" | undefined;
}[] = [{ name: "120b-low", model: "openai/gpt-oss-120b", effort: "low" }];

/** Whether two extractions would put the same thing in the journal. */
function sameOutcome(a: ExtractedTransaction[], b: ExtractedTransaction[]): string | null {
  if (a.length !== b.length) return `count ${a.length} vs ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.amount !== y.amount) return `amount ${x.amount} vs ${y.amount}`;
    if (x.amountProvenance !== y.amountProvenance) return "amountProvenance";
    if (x.needsConfirmation !== y.needsConfirmation) return "needsConfirmation";
    if (x.date !== y.date) return `date ${x.date} vs ${y.date}`;
    if ((x.paymentMethod ?? "").toLowerCase() !== (y.paymentMethod ?? "").toLowerCase()) {
      return `paymentMethod ${x.paymentMethod} vs ${y.paymentMethod}`;
    }
    if ((x.description ?? "").toLowerCase() !== (y.description ?? "").toLowerCase()) {
      return `description "${x.description}" vs "${y.description}"`;
    }
    if ((x.payee ?? "").toLowerCase() !== (y.payee ?? "").toLowerCase()) {
      return `payee ${x.payee} vs ${y.payee}`;
    }
  }
  return null;
}

async function replayExtract() {
  const every = (await loadCaptures()).filter((c) => c.transcript && c.extract_raw);
  const want = Number(process.argv[3]) || every.length;
  const step = Math.max(1, Math.floor(every.length / want));
  const all = every.filter((_, i) => i % step === 0).slice(0, want);
  const rows: Record<string, unknown>[] = [];
  const tally = new Map<string, { ms: number[]; same: number; differ: number; errors: number }>();
  for (const cfg of EXTRACT_CONFIGS) tally.set(cfg.name, { ms: [], same: 0, differ: 0, errors: 0 });

  for (const [i, c] of all.entries()) {
    const baseline = c.extract_raw?.transactions ?? [];
    // What the client sent at the time: its UTC date.
    const today = c.created_at.toISOString().slice(0, 10);
    const row: Record<string, unknown> = { id: c.id, transcript: c.transcript, baseline };

    for (const cfg of EXTRACT_CONFIGS) {
      const opts = { apiKey, model: cfg.model, reasoningEffort: cfg.effort };
      let result = await extractTransactions(c.transcript!, today, opts);
      for (let tries = 0; result.kind === "error" && tries < 8; tries++) {
        await sleep(result.status === 429 ? 20_000 : 3_000);
        result = await extractTransactions(c.transcript!, today, opts);
      }
      const t = tally.get(cfg.name)!;
      if (result.kind !== "ok") {
        t.errors += 1;
        row[cfg.name] = { kind: result.kind };
        continue;
      }
      t.ms.push(result.ms);
      const diff = sameOutcome(baseline, result.transactions);
      if (diff) t.differ += 1;
      else t.same += 1;
      row[cfg.name] = { ms: result.ms, diff, transactions: diff ? result.transactions : undefined };
      await sleep(400);
    }
    rows.push(row);
    await writeFile(join(OUT, "extract.json"), JSON.stringify(rows, null, 2));
    console.log(`[${i + 1}/${all.length}] ${c.transcript!.slice(0, 70)}`);
  }

  await writeFile(join(OUT, "extract.json"), JSON.stringify(rows, null, 2));
  console.log("\n=== Extraction summary (agreement with what production returned) ===");
  for (const [name, t] of tally) {
    console.log(
      name.padEnd(10),
      `p50 ${percentile(t.ms, 0.5)}ms  p90 ${percentile(t.ms, 0.9)}ms `,
      `same ${t.same}  differ ${t.differ}  errors ${t.errors}`,
    );
  }
}

async function main() {
  await mkdir(join(OUT, "audio"), { recursive: true });
  const mode = process.argv[2];
  if (mode === "asr") await replayAsr();
  else if (mode === "extract") await replayExtract();
  else console.log("usage: replay.ts asr | extract");
  await sql.end();
}

void main();

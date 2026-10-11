import { hasAmount } from "./amounts";
import { extractV2, type ExtractV2Result } from "./extract2";
import { quickParse } from "./quick";
import type { ExtractedTransaction, PaymentMethod } from "./types";

/**
 * Stage 2 as the capture route runs it: text in, transactions out, by the
 * cheapest route that is safe.
 *
 *   quick   a plain sentence (an amount, a known item, maybe a way of paying and a
 *           day) answered by code in a few milliseconds. See quick.ts.
 *   fast    everything else goes to the fast model first.
 *   full    and to the careful model if the fast one's answer fails a check, or
 *           if the fast model is unavailable or rate limited.
 *
 * Which models, and whether the quick route is on at all, are the knobs the
 * scoreboard (scripts/eval.ts) turns; the values below are what it chose, and the
 * numbers are in docs/design/SPEED-ACCURACY.md. The old single-model route stays
 * available (`VOICE_PIPELINE=v1`) so a bad day on any of this is one setting away
 * from yesterday.
 */

export const PIPELINE = process.env.VOICE_PIPELINE ?? "v2";

/** The careful model. Reasons before it answers, which is slower and is what the hard sentences need. */
export const FULL_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
/** The fast model, tried first for anything the quick route refused. Empty to skip it. */
export const FAST_MODEL = process.env.GROQ_FAST_MODEL ?? "qwen/qwen3.8-27b";
export const FAST_EFFORT = (process.env.GROQ_FAST_EFFORT ?? "") as "" | "none" | "low" | "medium" | "high";
export const FULL_EFFORT = (process.env.GROQ_FULL_EFFORT ?? "") as "" | "none" | "low" | "medium" | "high";

/** Set to "0" to turn the quick route off. */
const QUICK_ON = process.env.VOICE_QUICK !== "0";

export type Route = "quick" | "fast" | "full" | "fast+full";

export type PipelineResult =
  | {
      kind: "ok";
      model: string;
      route: Route;
      transactions: ExtractedTransaction[];
      raw: unknown;
      ms: number;
      amountChecks: ("match" | "mismatch" | "unread")[];
    }
  | { kind: "malformed"; model: string; content: string; ms: number }
  | { kind: "error"; model: string; status: 429 | 502; error: string; detail: string; ms: number };

/** Whether a fast answer is one to trust, or one to ask the careful model about. */
export function needsSecondOpinion(text: string, r: ExtractV2Result): boolean {
  if (r.kind !== "ok") return true;
  if (r.transactions.length === 0) return hasAmount(text);
  return r.transactions.some(
    (t, i) => t.amount === null || r.amountChecks[i] === "mismatch" || t.dateProvenance === "unknown",
  );
}

export async function runExtraction(
  text: string,
  today: string,
  opts: { apiKey: string; defaultPayment: PaymentMethod },
): Promise<PipelineResult> {
  const started = Date.now();
  const payment = opts.defaultPayment;

  if (QUICK_ON) {
    const quick = quickParse(text, today, payment);
    if (quick) {
      return {
        kind: "ok", model: "quick", route: "quick", transactions: quick.transactions,
        raw: { route: "quick", transactions: quick.transactions }, ms: Date.now() - started, amountChecks: quick.amountChecks,
      };
    }
  }

  const ask = (model: string, effort: typeof FULL_EFFORT, timeoutMs: number) =>
    extractV2(text, today, {
      apiKey: opts.apiKey, model, defaultPayment: payment, timeoutMs,
      reasoningEffort: effort === "" ? undefined : effort,
    });

  let first: ExtractV2Result | null = null;
  let route: Route = "full";
  if (FAST_MODEL) {
    // Four seconds: its normal answer takes about half a second, so a slower one is a bad moment
    // and the careful model behind it is the better use of the wait.
    first = await ask(FAST_MODEL, FAST_EFFORT, 4_000);
    route = "fast";
    if (!needsSecondOpinion(text, first)) return finish(first, route, started);
    route = "fast+full";
  }

  const full = await ask(FULL_MODEL, FULL_EFFORT, 12_000);
  // If the careful model could not answer at all but the fast one did, the fast answer beats an error.
  if (full.kind !== "ok" && first && first.kind === "ok") return finish(first, "fast", started);
  return finish(full, route, started);
}

function finish(r: ExtractV2Result, route: Route, started: number): PipelineResult {
  const ms = Date.now() - started;
  if (r.kind !== "ok") return { ...r, ms };
  return { kind: "ok", model: r.model, route, transactions: r.transactions, raw: { route, transactions: r.transactions, reply: r.raw }, ms, amountChecks: r.amountChecks };
}

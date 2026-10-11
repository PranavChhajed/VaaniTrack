/**
 * The voice scoreboard.
 *
 *   npx tsx --env-file=.env.local scripts/eval.ts text  [--name base] [--ids 1,2] [--tag dates] [--group payment]
 *   npx tsx --env-file=.env.local scripts/eval.ts diff  base candidate
 *
 * `text` runs the 120 written cases (qa/voice-cases.json, built from
 * docs/voice_transaction_100_test_cases.md) through the real extraction code and
 * scores what comes back. It needs no recordings, so it answers "did this prompt,
 * model or rule help the *reading*" quickly. Audio mode (recordings through the
 * transcriber too) is added once the recordings exist.
 *
 * What a result is scored as, worst first:
 *   silent_amount_error  a wrong amount that the app would have saved with no review.
 *                        One of these is disqualifying; the whole method exists to count them.
 *   silent_field_error   another field wrong (payment, date, how many entries) and saved with no review.
 *   guessed              an ambiguous line answered with a confident entry instead of a question.
 *   wrong_flagged        wrong, but sent to review: the gate did its job.
 *   missed               nothing came back for a line that has an expense in it.
 *   correct_review       right, but sent to review when it did not need to be (an unnecessary question).
 *   correct              right, saved without asking.
 *   asked                an ambiguous line, correctly sent to review or left blank.
 *   blocked              needs something that does not exist yet (a spoken correction of an earlier entry).
 *
 * "Saved without asking" is decided by `gateFailures`, the same function the app uses.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { buildSystemPrompt, extractTransactions } from "../src/lib/extract.ts";
import { extractV2, EXTRACT_V2_MODEL, PROMPT_V2 } from "../src/lib/extract2.ts";
import { shiftDay } from "../src/lib/dates.ts";
import { gateFailures } from "../src/lib/report.ts";
import type { ExtractedTransaction } from "../src/lib/types.ts";

/** A fixed day, so a date case means the same on every run. A Wednesday. */
export const TODAY = "2026-10-14";
const OUT = join(process.cwd(), ".captures", "eval");

type Entry = { amount: number | null; description?: string | null; payment: string; dayOffset: number | null; calendar?: string };
type Case = {
  id: number;
  group: string;
  tags: string[];
  utterance: string;
  expect: { entries?: Entry[]; clarify?: boolean; amountOnly?: number; clarifyOk?: boolean; conversation?: unknown };
};

export type Outcome =
  | "correct" | "correct_review" | "asked" | "wrong_flagged" | "missed"
  | "guessed" | "silent_field_error" | "silent_amount_error" | "blocked";

const SEVERITY: Outcome[] = [
  "silent_amount_error", "silent_field_error", "guessed", "missed", "wrong_flagged",
  "correct_review", "asked", "correct", "blocked",
];

type Result = {
  id: number;
  group: string;
  tags: string[];
  utterance: string;
  outcome: Outcome;
  why: string;
  ms: number;
  model: string;
  returned: ExtractedTransaction[];
  completion?: number;
  prompt?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

const saved = (row: ExtractedTransaction) => gateFailures(row, true, false).length === 0;

function matchEntries(want: Entry[], got: ExtractedTransaction[]): { pairs: [Entry, ExtractedTransaction | null][] } {
  const used = new Set<number>();
  const pairs: [Entry, ExtractedTransaction | null][] = [];
  for (const w of want) {
    let best = -1;
    let bestScore = -1;
    got.forEach((g, i) => {
      if (used.has(i)) return;
      let score = 0;
      if (g.amount === w.amount) score += 2;
      const d = (g.description ?? "").toLowerCase();
      if (w.description && d && (d.includes(w.description) || w.description.includes(d))) score += 1;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    if (best >= 0) used.add(best);
    pairs.push([w, best >= 0 ? got[best] : null]);
  }
  return { pairs };
}

function fieldProblems(w: Entry, g: ExtractedTransaction): { amount: boolean; others: string[] } {
  const others: string[] = [];
  if (w.description) {
    const d = (g.description ?? "").toLowerCase();
    if (!d || !(d.includes(w.description) || w.description.includes(d))) others.push(`description "${g.description}" for "${w.description}"`);
  }
  const pay = (g.paymentMethod ?? "").toLowerCase();
  if (pay !== w.payment.toLowerCase()) others.push(`payment ${g.paymentMethod} for ${w.payment}`);
  if (w.dayOffset !== null) {
    const want = shiftDay(TODAY, w.dayOffset);
    if ((g.date ?? TODAY) !== want) others.push(`date ${g.date} for ${want}`);
  }
  return { amount: g.amount !== w.amount, others };
}

function score(c: Case, got: ExtractedTransaction[], failed: boolean): { outcome: Outcome; why: string } {
  if (c.expect.conversation) return { outcome: "blocked", why: "needs a spoken correction of an earlier entry" };
  if (failed) return { outcome: "missed", why: "the call failed" };

  if (c.expect.clarify) {
    const guessed = got.filter((g) => saved(g));
    return guessed.length === 0
      ? { outcome: "asked", why: got.length ? "sent to review" : "nothing recorded" }
      : { outcome: "guessed", why: `saved ${guessed.map((g) => g.amount).join(", ")} without asking` };
  }

  if (c.expect.amountOnly !== undefined) {
    if (got.length === 0) return { outcome: "missed", why: "nothing came back" };
    const g = got[0];
    if (g.amount !== c.expect.amountOnly) {
      return { outcome: saved(g) ? "silent_amount_error" : "wrong_flagged", why: `amount ${g.amount}` };
    }
    const invented = g.category && g.categoryProvenance !== "unknown";
    if (invented && saved(g)) return { outcome: "silent_field_error", why: `invented category ${g.category}` };
    return { outcome: saved(g) ? "correct" : "correct_review", why: "" };
  }

  const want = c.expect.entries ?? [];
  if (got.length === 0) return { outcome: "missed", why: "no entries" };
  const { pairs } = matchEntries(want, got);
  const problems: string[] = [];
  let amountWrongSaved = false;
  let otherWrongSaved = false;
  let anyWrong = false;
  let allSaved = true;

  if (got.length !== want.length) {
    anyWrong = true;
    problems.push(`${got.length} entries for ${want.length}`);
    if (got.some(saved)) otherWrongSaved = true;
  }
  for (const [w, g] of pairs) {
    if (!g) { anyWrong = true; problems.push(`no entry for ${w.amount}`); continue; }
    const p = fieldProblems(w, g);
    if (!saved(g)) allSaved = false;
    if (p.amount) { anyWrong = true; problems.push(`amount ${g.amount} for ${w.amount}`); if (saved(g)) amountWrongSaved = true; }
    if (p.others.length) { anyWrong = true; problems.push(...p.others); if (saved(g)) otherWrongSaved = true; }
  }
  if (c.expect.clarifyOk && !anyWrong) return { outcome: allSaved ? "correct" : "asked", why: "" };
  if (amountWrongSaved) return { outcome: "silent_amount_error", why: problems.join("; ") };
  if (otherWrongSaved) return { outcome: "silent_field_error", why: problems.join("; ") };
  if (anyWrong) return { outcome: "wrong_flagged", why: problems.join("; ") };
  return { outcome: allSaved ? "correct" : "correct_review", why: allSaved ? "" : "right, but asked" };
}

async function cached<T>(key: string, produce: () => Promise<T>): Promise<T> {
  const file = join(OUT, "cache", `${createHash("sha1").update(key).digest("hex")}.json`);
  try { return JSON.parse(await readFile(file, "utf8")) as T; } catch { /* not cached */ }
  const value = await produce();
  await mkdir(join(OUT, "cache"), { recursive: true });
  await writeFile(file, JSON.stringify(value));
  return value;
}

type Run = { transactions: ExtractedTransaction[]; ms: number; model: string; failed: boolean; completion?: number; prompt?: number };

/** Which pipeline to score, and with what. v1 is what ships today; v2 is the values-only extractor. */
const PIPELINE = arg("pipeline") ?? "v1";
const MODEL = arg("model");
const EFFORT = arg("effort") as "low" | "medium" | "high" | undefined;

async function runCase(c: Case, apiKey: string, payment: "UPI"): Promise<Run> {
  const key = PIPELINE === "v2"
    ? `v2|${MODEL ?? EXTRACT_V2_MODEL}|${EFFORT ?? "-"}|${PROMPT_V2}|${payment}|${TODAY}
--
${c.utterance}`
    : `${buildSystemPrompt(TODAY, payment)}
--
${c.utterance}`;
  return cached(key, async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      if (PIPELINE === "v2") {
        const r = await extractV2(c.utterance, TODAY, { apiKey, defaultPayment: payment, model: MODEL, reasoningEffort: EFFORT });
        if (r.kind === "ok") return { transactions: r.transactions, ms: r.ms, model: r.model, failed: false, completion: r.usage?.completion, prompt: r.usage?.prompt };
        if (r.kind === "error" && r.status === 429) { await sleep(15_000); continue; }
        return { transactions: [], ms: r.ms, model: r.model, failed: true };
      }
      const r = await extractTransactions(c.utterance, TODAY, { apiKey, defaultPayment: payment });
      if (r.kind === "ok") return { transactions: r.transactions, ms: r.ms, model: r.model, failed: false };
      if (r.kind === "error" && r.status === 429) { await sleep(20_000); continue; }
      return { transactions: [], ms: r.ms, model: r.model, failed: true };
    }
    return { transactions: [], ms: 0, model: "?", failed: true };
  });
}

function summarise(results: Result[]) {
  const count = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  const scored = results.filter((r) => r.outcome !== "blocked");
  const good = (r: Result) => r.outcome === "correct" || r.outcome === "correct_review" || r.outcome === "asked";
  return {
    total: results.length,
    scored: scored.length,
    ...Object.fromEntries(SEVERITY.map((o) => [o, count(o)])),
    right: scored.filter(good).length,
    msP50: percentile(results.map((r) => r.ms).filter(Boolean), 0.5),
    msP95: percentile(results.map((r) => r.ms).filter(Boolean), 0.95),
    completionP50: percentile(results.map((r) => r.completion ?? 0).filter(Boolean), 0.5),
    promptTokens: percentile(results.map((r) => r.prompt ?? 0).filter(Boolean), 0.5),
  };
}

function printReport(name: string, results: Result[]) {
  const s = summarise(results);
  console.log(`\n=== ${name}: ${s.total} cases (${s.blocked} blocked on features not built)`);
  console.log(`right ${s.right}/${s.scored}   silent amount errors ${s.silent_amount_error}   silent field errors ${s.silent_field_error}   guessed ${s.guessed}`);
  console.log(`correct ${s.correct}   right-but-asked ${s.correct_review}   asked ${s.asked}   wrong-but-flagged ${s.wrong_flagged}   missed ${s.missed}`);
  console.log(`extraction time  p50 ${s.msP50} ms   p95 ${s.msP95} ms` + (s.completionP50 ? `   tokens per reply: prompt ${s.promptTokens}, written ${s.completionP50} (median)` : ""));
  const groups = [...new Set(results.map((r) => r.group))];
  console.log("\nby group (right / scored):");
  for (const g of groups) {
    const rs = results.filter((r) => r.group === g && r.outcome !== "blocked");
    const ok = rs.filter((r) => ["correct", "correct_review", "asked"].includes(r.outcome)).length;
    console.log(`  ${g.padEnd(16)} ${ok}/${rs.length}`);
  }
  const bad = results.filter((r) => !["correct", "asked", "blocked"].includes(r.outcome))
    .sort((a, b) => SEVERITY.indexOf(a.outcome) - SEVERITY.indexOf(b.outcome));
  if (bad.length) console.log("\nnot clean:");
  for (const r of bad) console.log(`  #${String(r.id).padEnd(3)} ${r.outcome.padEnd(20)} "${r.utterance}"  ${r.why}`);
}

async function main() {
  const mode = process.argv[2];
  if (mode === "diff") {
    const [a, b] = [process.argv[3], process.argv[4]];
    const load = async (n: string) => JSON.parse(await readFile(join(OUT, `${n}.json`), "utf8")) as { results: Result[] };
    const A = (await load(a)).results, B = (await load(b)).results;
    const byId = new Map(A.map((r) => [r.id, r]));
    const sa = summarise(A), sb = summarise(B);
    console.log(`\n${a} -> ${b}`);
    for (const k of ["right", "silent_amount_error", "silent_field_error", "guessed", "missed", "wrong_flagged", "correct_review", "msP50", "msP95"] as const) {
      console.log(`  ${k.padEnd(22)} ${String(sa[k]).padStart(6)} -> ${String(sb[k]).padStart(6)}`);
    }
    console.log("\nchanged cases:");
    for (const r of B) {
      const before = byId.get(r.id);
      if (before && before.outcome !== r.outcome) console.log(`  #${String(r.id).padEnd(3)} ${before.outcome} -> ${r.outcome}   "${r.utterance}"  ${r.why}`);
    }
    return;
  }
  if (mode !== "text") {
    console.log("usage: scripts/eval.ts text [--name n] [--ids 1,2] [--tag t] [--group g]  |  scripts/eval.ts diff a b");
    process.exit(1);
  }

  const apiKey = process.env.GROQ_API_KEY ?? "";
  if (!apiKey) { console.error("GROQ_API_KEY is not set (use --env-file=.env.local)"); process.exit(1); }
  let cases = JSON.parse(await readFile(join(process.cwd(), "qa", "voice-cases.json"), "utf8")) as Case[];
  const ids = arg("ids")?.split(",").map(Number);
  const tag = arg("tag");
  const group = arg("group");
  if (ids) cases = cases.filter((c) => ids.includes(c.id));
  if (tag) cases = cases.filter((c) => c.tags.includes(tag));
  if (group) cases = cases.filter((c) => c.group === group);

  const name = arg("name") ?? "latest";
  console.log(`pipeline ${PIPELINE}` + (PIPELINE === "v2" ? `, model ${MODEL ?? EXTRACT_V2_MODEL}, effort ${EFFORT ?? "default"}` : ""));
  const results: Result[] = [];
  for (const c of cases) {
    if (c.expect.conversation) {
      results.push({ id: c.id, group: c.group, tags: c.tags, utterance: c.utterance, ...score(c, [], false), ms: 0, model: "-", returned: [] });
      continue;
    }
    const run = await runCase(c, apiKey, "UPI");
    const { outcome, why } = score(c, run.transactions, run.failed);
    results.push({ id: c.id, group: c.group, tags: c.tags, utterance: c.utterance, outcome, why, ms: run.ms, model: run.model, returned: run.transactions, completion: run.completion, prompt: run.prompt });
    process.stdout.write(outcome === "correct" || outcome === "asked" ? "." : outcome === "correct_review" ? "r" : "X");
  }
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, `${name}.json`), JSON.stringify({ at: new Date().toISOString(), today: TODAY, results }, null, 1));
  printReport(name, results);
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * How much of the written cases the plain-expense reader takes, and whether what
 * it takes is right. Run: npx tsx scripts/quick-coverage.ts
 *
 * A wrong accept is the failure that matters: a sentence it should have refused
 * and answered itself, wrongly, with no model to catch it. Any is a bug.
 */
import { readFileSync } from "node:fs";
import { shiftDay } from "../src/lib/dates.ts";
import { quickParse } from "../src/lib/quick.ts";

const TODAY = "2026-10-14";
type Entry = { amount: number | null; description?: string | null; payment: string; dayOffset: number | null };
type Case = { id: number | string; utterance: string; expect: { entries?: Entry[]; clarify?: boolean; amountOnly?: number; conversation?: unknown } };
const cases = [
  ...(JSON.parse(readFileSync("qa/voice-cases.json", "utf8")) as Case[]),
  ...(JSON.parse(readFileSync("qa/voice-cases-extra.json", "utf8")) as Case[]),
];

let taken = 0, wrong = 0, refused = 0;
const takenList: string[] = [];
for (const c of cases) {
  const r = quickParse(c.utterance, TODAY, "UPI");
  if (!r) { refused++; continue; }
  taken++;
  const t = r.transactions[0];
  const want = c.expect.entries?.[0];
  const problems: string[] = [];
  if (c.expect.conversation) { /* read alone it is a fine entry; a correction is caught before extraction once voice edits exist */ }
  else if (c.expect.clarify) problems.push("should have asked");
  else if (c.expect.amountOnly !== undefined) { if (t.amount !== c.expect.amountOnly) problems.push(`amount ${t.amount}`); }
  else if (!want || (c.expect.entries?.length ?? 0) !== 1) problems.push("entry count");
  else {
    if (t.amount !== want.amount) problems.push(`amount ${t.amount} for ${want.amount}`);
    if ((t.paymentMethod ?? "").toLowerCase() !== want.payment.toLowerCase()) problems.push(`payment ${t.paymentMethod} for ${want.payment}`);
    if (want.dayOffset !== null && t.date !== shiftDay(TODAY, want.dayOffset)) problems.push(`date ${t.date}`);
    const d = (t.description ?? "").toLowerCase();
    if (want.description && !(d.includes(want.description) || want.description.includes(d))) problems.push(`description "${t.description}" for "${want.description}"`);
  }
  if (problems.length) { wrong++; console.log(`WRONG ACCEPT  #${c.id} "${c.utterance}"  ${problems.join("; ")}`); }
  else takenList.push(`#${c.id} "${c.utterance}"`);
}
console.log(`\n${taken} of ${cases.length} taken (${Math.round((100 * taken) / cases.length)}%), ${refused} passed to the model, ${wrong} wrong accepts`);
if (process.argv.includes("--list")) console.log(takenList.join("\n"));
process.exit(wrong ? 1 : 0);

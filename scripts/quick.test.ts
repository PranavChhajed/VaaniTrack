/**
 * Checks for the plain-expense reader. Run: npx tsx scripts/quick.test.ts
 *
 * Half of these are sentences it must take, and half are sentences it must
 * refuse. The refusals matter more: a sentence it wrongly takes is answered with
 * no model to catch it.
 */
import { quickParse } from "../src/lib/quick.ts";

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}` +
      (ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`),
  );
}

const TODAY = "2026-10-14"; // a Wednesday
const q = (text: string) => quickParse(text, TODAY, "UPI")?.transactions[0] ?? null;
const shape = (text: string) => {
  const t = q(text);
  return t ? [t.amount, t.description, t.paymentMethod, t.date] : null;
};

console.log("--- takes");
check("amount and item", shape("250 lunch"), [250, "lunch", "UPI", "2026-10-14"]);
check("item first", shape("Dinner, 500."), [500, "dinner", "UPI", "2026-10-14"]);
check("words for the amount", shape("two fifty chai"), [250, "chai", "UPI", "2026-10-14"]);
check("a verb and fillers", shape("I just spent 450 on lunch"), [450, "lunch", "UPI", "2026-10-14"]);
check("rupees", shape("Fifty rupees for chai"), [50, "chai", "UPI", "2026-10-14"]);
check("teens", shape("chai was fifteen rupees"), [15, "chai", "UPI", "2026-10-14"]);
check("k", shape("2.5k on dinner"), [2500, "dinner", "UPI", "2026-10-14"]);
check("paid in cash", shape("300 lunch, paid in cash"), [300, "lunch", "Cash", "2026-10-14"]);
check("on my card", shape("200 for coffee on my card"), [200, "coffee", "Card", "2026-10-14"]);
check("through upi", shape("Paid 120 for chai through UPI"), [120, "chai", "UPI", "2026-10-14"]);
check("google pay", shape("150 for the auto, paid by Google Pay"), [150, "auto", "UPI", "2026-10-14"]);
check("yesterday", shape("I spent 400 on dinner yesterday"), [400, "dinner", "UPI", "2026-10-13"]);
check("yesterday's", shape("Yesterday's lunch was 300"), [300, "lunch", "UPI", "2026-10-13"]);
check("day before yesterday", shape("Day before yesterday I spent 250 on lunch"), [250, "lunch", "UPI", "2026-10-12"]);
check("this morning", shape("I bought coffee for 180 this morning"), [180, "coffee", "UPI", "2026-10-14"]);
check("last night", shape("Spent 500 on dinner last night"), [500, "dinner", "UPI", "2026-10-13"]);
check("a weekday", shape("on Monday I paid 300 for the cab"), [300, "cab", "UPI", "2026-10-12"]);
check("two days ago", shape("120 chai two days ago"), [120, "chai", "UPI", "2026-10-12"]);
check("two words for an item", shape("40 for ice cream"), [40, "ice cream", "UPI", "2026-10-14"]);
check("dhai sau", shape("Dhai sau ka lunch"), [250, "lunch", "UPI", "2026-10-14"]);
check("with the person's own default", quickParse("250 lunch", TODAY, "Card")?.transactions[0].paymentMethod, "Card");
check("a category from the item", q("250 lunch")?.category, "food");
check("auto is transport", q("60 auto")?.category, "transport");
check("amount is said, not inferred", q("250 lunch")?.amountProvenance, "said");
check("payment default is marked", q("250 lunch")?.paymentMethodProvenance, "default");

console.log("--- refuses");
for (const [name, text] of [
  ["two expenses", "300 lunch and 150 coffee"],
  ["two amounts", "one coffee for fifty"],
  ["a person", "paid 500 to Rahul"],
  ["a person, no verb", "250 to Pushpa"],
  ["paid for someone", "I paid 500 for Rahul"],
  ["a correction", "250, no wait, 280 on lunch"],
  ["a correction, said later", "Actually, make that 300"],
  ["no amount", "lunch"],
  ["no item", "That was 200"],
  ["no item, a bare payment", "Paid 300"],
  ["a word it does not know", "250 for the zorblax"],
  ["a name", "300 for Pushpa"],
  ["an ambiguous price", "2.50 lunch"],
  ["a calendar day", "On September 3rd I spent 900 on shopping"],
  ["tomorrow", "500 dinner tomorrow"],
  ["last week", "400 lunch last week"],
  ["too long", "I went to the market this morning and then to the other market and spent two hundred and fifty on lunch"],
  ["conflicting payments", "300 lunch cash card"],
  ["amount it cannot read all of", "Chhe sau pachhattar on the bill"],
  ["empty", ""],
  ["a stock phrase", "Thank you."],
] as const) {
  check(`refuses: ${name}`, quickParse(text, TODAY, "UPI"), null);
}

console.log(failures === 0 ? "\nall passed\n" : `\n${failures} FAILED\n`);
process.exit(failures ? 1 : 0);

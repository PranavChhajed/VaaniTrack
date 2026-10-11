/**
 * Checks for finishRows, the step that judges what the model returned.
 * Run: npx tsx scripts/finish.test.ts
 *
 * The model is trusted for values and for nothing else. Every judgement here
 * (said or inferred, the amount's cross-check, the day, the payment) is code.
 */
import { finishRows, mentionsPayment, wasSaid } from "../src/lib/finish.ts";
import { gateFailures } from "../src/lib/report.ts";

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
const one = (rows: unknown[], said: string, pay: "UPI" | "Cash" | "Card" = "UPI") =>
  finishRows(rows, said, TODAY, pay).transactions;
const autoSaved = (t: ReturnType<typeof one>[number]) => gateFailures(t, true, false).length === 0;

console.log("--- the amount");
{
  const [t] = one([{ amount: 250, description: "lunch" }], "250 lunch");
  check("read the same: said", t.amountProvenance, "said");
  check("and saved without asking", autoSaved(t), true);
}
{
  const [t] = one([{ amount: 250, description: "lunch" }], "two fifty lunch");
  check("read from words: said", t.amountProvenance, "said");
}
{
  const [t] = one([{ amount: 520, description: "lunch" }], "250 lunch");
  check("the model disagrees with the words: asks", [t.needsConfirmation, autoSaved(t)], [true, false]);
  check("and says why, with the number that was heard", /250/.test(t.confirmationReason ?? "") && /520/.test(t.confirmationReason ?? ""), true);
}
{
  const [t] = one([{ amount: 280, description: "lunch" }], "250, no wait, 280 on lunch");
  check("a correction: the final value is among the words", t.amountProvenance, "said");
}
{
  const [t] = one([{ amount: 250, description: "lunch" }], "$2.50 lunch");
  check("a price artefact the model fixed", t.amountProvenance, "said");
}
{
  const [t] = one([{ amount: 700, description: "lunch" }], "lunch was a good one");
  check("an amount with nothing in the words behind it: not said", [t.amountProvenance, autoSaved(t)], ["inferred", false]);
}
{
  const [t] = one([{ amount: null, description: "lunch" }], "lunch");
  check("no amount: asks", [t.needsConfirmation, autoSaved(t)], [true, false]);
}
{
  const [t] = one([{ amount: "250" as unknown as number, description: "lunch" }], "250 lunch");
  check("an amount that is not a number is none", t.amount, null);
}
{
  const [t] = one([{ amount: -5, description: "x" }], "5 x");
  check("a negative amount is none", t.amount, null);
}

console.log("--- said or inferred");
{
  const [t] = one([{ amount: 250, description: "lunch", category: "food" }], "250 lunch");
  check("the thing bought was said", t.descriptionProvenance, "said");
  check("a category the speaker never said is inferred", t.categoryProvenance, "inferred");
}
{
  const [t] = one([{ amount: 250, description: "meal", category: null }], "250 lunch");
  check("a paraphrase is inferred, not said", t.descriptionProvenance, "inferred");
}
{
  const [t] = one([{ amount: 500, payee: "Rahul" }], "paid 500 to Rahul");
  check("a payee who was named", [t.payee, t.payeeProvenance], ["Rahul", "said"]);
}
check("wasSaid: plural", wasSaid("chai", "two chais please"), true);
check("wasSaid: a word that is not there", wasSaid("petrol", "250 lunch"), false);
check("wasSaid: several words", wasSaid("phone bill", "2000 for the phone bill"), true);

console.log("--- payment");
{
  const [t] = one([{ amount: 300, description: "lunch", paymentMethod: "Cash" }], "300 lunch, paid in cash");
  check("said", [t.paymentMethod, t.paymentMethodProvenance], ["Cash", "said"]);
}
{
  const [t] = one([{ amount: 300, description: "lunch", paymentMethod: "Cash" }], "300 lunch");
  check("the model says cash, nobody did: the default", [t.paymentMethod, t.paymentMethodProvenance], ["UPI", "default"]);
}
{
  const [t] = one([{ amount: 300, description: "lunch" }], "300 lunch", "Card");
  check("not said: the person's own default", [t.paymentMethod, t.paymentMethodProvenance], ["Card", "default"]);
}
{
  const rows = one([
    { amount: 200, description: "chai" },
    { amount: 600, description: "groceries", paymentMethod: "Cash" },
  ], "200 for chai and 600 for groceries, groceries was cash");
  check("each entry has its own", rows.map((r) => r.paymentMethod), ["UPI", "Cash"]);
}
{
  const [t] = one([{ amount: 120, description: "chai", paymentMethod: "upi" }], "120 chai through google pay");
  check("another word for UPI", [t.paymentMethod, t.paymentMethodProvenance], ["UPI", "said"]);
}
check("mentionsPayment: card", mentionsPayment("Card", "on my credit card"), true);
check("mentionsPayment: not mentioned", mentionsPayment("Cash", "paid 300 for lunch"), false);

console.log("--- the day");
{
  const [t] = one([{ amount: 400, description: "dinner", dateWords: "yesterday" }], "I spent 400 on dinner yesterday");
  check("yesterday", [t.date, t.dateProvenance], ["2026-10-13", "said"]);
}
{
  const [t] = one([{ amount: 400, description: "dinner", dateWords: "last Friday" }], "last Friday 400 on dinner");
  check("last friday, from a wednesday", t.date, "2026-10-09");
}
{
  const [t] = one([{ amount: 400, description: "dinner", dateWords: "September 3rd" }], "on September 3rd I spent 400 on dinner");
  check("a calendar day", t.date, "2026-09-03");
}
{
  const [t] = one([{ amount: 400, description: "dinner" }], "400 dinner");
  check("no day said: today, by default", [t.date, t.dateProvenance], ["2026-10-14", "default"]);
}
{
  const [t] = one([{ amount: 400, description: "dinner", dateWords: "last week" }], "last week 400 dinner");
  check("a day it cannot work out: asks, does not guess", [t.date, t.needsConfirmation, autoSaved(t)], [null, true, false]);
}
{
  const [t] = one([{ amount: 400, description: "dinner", dateWords: "yesterday" }], "400 dinner");
  check("date words the speaker never said: asks", [t.date, t.needsConfirmation], [null, true]);
}
{
  const rows = one([
    { amount: 200, description: "coffee", dateWords: "today" },
    { amount: 300, description: "lunch", dateWords: "yesterday" },
  ], "I spent 200 on coffee today and 300 on lunch yesterday");
  check("two entries, two days", rows.map((r) => r.date), ["2026-10-14", "2026-10-13"]);
}

console.log("--- time, ask, shape");
{
  const [t] = one([{ amount: 120, description: "chai", time: "17:00" }], "120 chai");
  check("a clock time nobody said is dropped", [t.time, t.timeProvenance], [null, "unknown"]);
}
{
  const [t] = one([{ amount: 120, description: "chai", time: "17:00" }], "120 chai at 5 pm");
  check("a clock time that was said is kept", [t.time, t.timeProvenance], ["17:00", "said"]);
}
{
  const [t] = one([{ amount: 250, payee: "Pushpa", ask: "Is this a payment to Pushpa, or money lent?" }], "250 to Pushpa");
  check("a question from the model holds the entry", [t.needsConfirmation, autoSaved(t)], [true, false]);
  check("with its reason", t.confirmationReason, "Is this a payment to Pushpa, or money lent?");
}
check("no rows", one([], "hello"), []);
check("not an array", one("nope" as unknown as unknown[], "hello"), []);
check("junk rows are dropped", one([null, 5, "x", { amount: 10, description: "tea" }] as unknown[], "10 tea").length, 1);
check("the word null is no value", one([{ amount: 10, description: "null" }], "10 tea")[0].description, null);
check("a long description is cut", one([{ amount: 10, description: "x".repeat(300) }], "10")[0].description?.length, 80);

console.log(failures === 0 ? "\nall passed\n" : `\n${failures} FAILED\n`);
process.exit(failures ? 1 : 0);

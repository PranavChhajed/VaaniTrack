/**
 * Checks for the transcript amount reader. Run: npx tsx scripts/amounts.test.ts
 *
 * Every line here is a way a real person says, or a transcriber writes, an
 * amount. The reader is the second opinion on the one field that must not be
 * wrong, so a form it cannot read is a form that gets no second opinion.
 */
import { checkAmount, hasAmount, readAmounts } from "../src/lib/amounts.ts";

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}` +
      (ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`),
  );
}
const values = (text: string) => readAmounts(text).map((r) => r.value);

console.log("--- digits");
check("plain", values("250 lunch"), [250]);
check("with a comma", values("groceries 1,250"), [1250]);
check("indian grouping", values("12,50,000 for the flat"), [1250000]);
check("rupee sign", values("₹250 for chai"), [250]);
check("Rs prefix", values("Rs 250 chai"), [250]);
check("Rs. prefix", values("Rs. 250 chai"), [250]);
check("rs suffix", values("250rs chai"), [250]);
check("rupees word", values("250 rupees chai"), [250]);
check("slash dash", values("₹250/- chai"), [250]);
check("comma after the amount", values("250, lunch"), [250]);
check("decimal", values("spent 99.5 on tea"), [99.5]);
check("two amounts", values("300 lunch and 150 coffee"), [300, 150]);

console.log("--- suffixes");
check("2.5k", values("2.5k for dinner"), [2500]);
check("2.5 k", values("2.5 k for dinner"), [2500]);
check("2k", values("2k"), [2000]);
check("1.5 lakh", values("1.5 lakh for the car"), [150000]);
check("2 thousand", values("2 thousand on shopping"), [2000]);
check("5 hundred", values("5 hundred on groceries"), [500]);
check("1 crore", values("1 crore"), [10000000]);

console.log("--- the transcriber's prices");
check("$2.50 is two fifty", values("$2.50 lunch"), [250]);
check("$1.20 is one twenty", values("$1.20 chai"), [120]);
check("$15.00 is fifteen hundred", values("$15.00 groceries"), [1500]);
check("$3.00 is three hundred", values("$3.00 dinner"), [300]);
check("$5.82 is 582", values("$5.82"), [582]);
check("plain $300 is 300", values("$300"), [300]);
check("a bare 2.50 offers both readings", values("2.50 lunch"), [250, 2.5]);
check("a 3 digit decimal is just a decimal", values("250.00 lunch"), [250]);

console.log("--- english words");
check("two fifty", values("two fifty lunch"), [250]);
check("seven fifty", values("Seven fifty for groceries"), [750]);
check("one twenty", values("One twenty on snacks"), [120]);
check("twelve fifty", values("twelve fifty"), [1250]);
check("one fifty", values("one fifty"), [150]);
check("two fifty five", values("two fifty five"), [255]);
check("fifteen hundred", values("fifteen hundred"), [1500]);
check("twenty five hundred", values("twenty five hundred"), [2500]);
check("fifty", values("fifty rupees for chai"), [50]);
check("fifteen", values("chai was fifteen rupees"), [15]);
check("nineteen", values("nineteen"), [19]);
check("twenty five", values("twenty five"), [25]);
check("two hundred and fifty", values("Two hundred and fifty for lunch"), [250]);
check("a hundred and twenty", values("A hundred and twenty for coffee"), [120]);
check("three hundred bucks", values("Three hundred bucks on dinner"), [300]);
check("one thousand", values("I spent one thousand on groceries"), [1000]);
check("a thousand", values("a thousand on shopping"), [1000]);
check("two thousand", values("Two thousand on shopping"), [2000]);
check("one thousand two hundred", values("one thousand two hundred"), [1200]);
check("two thousand five hundred", values("two thousand five hundred"), [2500]);
check("one lakh twenty thousand", values("one lakh twenty thousand"), [120000]);
check("ninety rupees", values("Ninety rupees, coffee"), [90]);
check("two oh five", values("two oh five"), [205]);
check("two and a half thousand", values("Two and a half thousand for the repair"), [2500]);
check("one point five lakh", values("one point five lakh"), [150000]);
check("half a lakh", values("half a lakh for the gift"), [50000]);
check("hundred alone", values("hundred rupees"), [100]);
check("two amounts in words", values("two fifty lunch and one twenty chai"), [250, 120]);
check("a bare small word", values("one coffee for fifty"), [1, 50]);

console.log("--- hindi forms the prompt already claims");
check("dhai sau", values("Dhai sau ka lunch"), [250]);
check("dedh sau, as the transcriber spells it", values("Dhedh sau chai"), [150]);
check("dedh sau spelled right", values("dedh sau chai"), [150]);
check("sava sau", values("Sava sau for auto"), [125]);
check("paune do sau", values("Paune do sau on breakfast"), [175]);
check("ek lakh", values("Ek lakh for the deposit"), [100000]);
check("dedh lakh", values("Spent dedh lakh on the car"), [150000]);
check("paanch sau", values("Paanch sau on groceries"), [500]);
check("do hazaar", values("Do hazaar for the phone bill"), [2000]);
check("saadhe teen hazaar", values("Saadhe teen hazaar on shopping"), [3500]);
check("aadha lakh", values("Aadha lakh for the wedding gift"), [50000]);
check("bees rupees", values("Chai was bees rupees"), [20]);
check("teen sau paachas", values("Teen sau paachas for dinner"), [350]);

console.log("--- not money");
check("a date's ordinal", values("On September 3rd I spent 900 on shopping"), [900]);
check("a day of the month", values("on september 3 I spent 900"), [900]);
check("a time", values("at 5 pm I paid 120 for chai"), [120]);
check("days ago", values("I paid 700 for groceries two days ago"), [700]);
check("a quantity", values("2 kg rice for 100"), [100]);
check("no number at all", values("Thank you."), []);
check("no number, but long", values("I'm going to show you how to get to the top of the mountain."), []);

console.log("--- hasAmount (replaces the short word list in asr.ts)");
check("fifteen rupees is an amount", hasAmount("chai was fifteen rupees"), true);
check("seventeen is an amount", hasAmount("seventeen for parking"), true);
check("digits", hasAmount("250"), true);
check("none", hasAmount("Before lunch."), false);
check("none, a stock phrase", hasAmount("Thank you."), false);

console.log("--- checkAmount");
const r = (t: string) => readAmounts(t);
check("same number", checkAmount(250, r("250 lunch")), "match");
check("the model read it from words", checkAmount(250, r("two fifty lunch")), "match");
check("a correction: the final value is among the reads", checkAmount(280, r("250, no wait, 280 on lunch")), "match");
check("the model disagrees with the digits", checkAmount(520, r("250 lunch")), "mismatch");
check("the model disagrees with the words", checkAmount(205, r("two fifty lunch")), "mismatch");
check("a price artefact the model fixed", checkAmount(250, r("$2.50 lunch")), "match");
check("a price artefact the model did not fix", checkAmount(2.5, r("$2.50 lunch")), "mismatch");
check("a bare 2.50 read literally by the model", checkAmount(2.5, r("2.50 lunch")), "match");
check("nothing to read", checkAmount(250, r("lunch")), "unread");
check("the model gave no amount", checkAmount(null, r("250 lunch")), "unread");

console.log(failures === 0 ? "\nall passed\n" : `\n${failures} FAILED\n`);
process.exit(failures ? 1 : 0);

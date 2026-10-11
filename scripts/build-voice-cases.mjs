// Turns docs/voice_transaction_100_test_cases.md into qa/voice-cases.json.
//
//   node scripts/build-voice-cases.mjs
//
// The document is the human source of truth; this reads its tables once and
// writes what scripts/eval.ts scores against. Anything the tables do not say
// precisely enough to score (ambiguity, conversations, multi-expense rows) is
// stated here by hand, case by case, so a reader can see what each case is held to.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const md = readFileSync(join(root, "docs", "voice_transaction_100_test_cases.md"), "utf8").replace(/\r\n/g, "\n");

const GROUPS = [
  [1, 10, "basic"], [11, 20, "messy"], [21, 30, "amounts"], [31, 40, "payment"],
  [41, 50, "dates"], [51, 60, "multiple"], [61, 70, "correction"], [71, 80, "self-correction"],
  [81, 90, "ambiguity"], [91, 100, "complex"], [101, 120, "indian-numbers"],
];
const groupOf = (n) => GROUPS.find(([a, b]) => n >= a && n <= b)[2];

/** "₹1,250, groceries, food, cash, T−1" -> one expected entry. */
function entry(text) {
  const amount = /₹\s*([\d,]+)/.exec(text);
  const offset = /T[−-](\d)/.exec(text);
  const lower = text.toLowerCase();
  const rest = amount ? text.slice(amount.index + amount[0].length).replace(/^s*,s*/, "") : text;
  const first = rest.split(",")[0].trim();
  const second = first && !/^(food|UPI|cash|card|today|T[−-]|T$)/i.test(first) ? first : null;
  return {
    description: second,
    amount: amount ? Number(amount[1].replace(/,/g, "")) : null,
    payment: /\bcash\b/.test(lower) ? "Cash" : /\bcard\b/.test(lower) ? "Card" : "UPI",
    dayOffset: offset ? -Number(offset[1]) : 0,
  };
}

const cases = [];
for (const line of md.split("\n")) {
  const m = /^\|\s*(\d{1,3})\s*\|\s*"(.+?)"\s*\|\s*(.+?)\s*\|\s*\|?\s*$/.exec(line);
  if (!m) continue;
  const id = Number(m[1]);
  if (id < 1 || id > 120) continue;
  const utterance = m[2].replace(/…/g, "...");
  const expected = m[3].replace(/\*\*/g, "");
  cases.push({ id, group: groupOf(id), utterance, doc: expected, entry: entry(expected) });
}

const byId = new Map(cases.map((c) => [c.id, c]));
const set = (id, patch) => {
  if (!byId.has(id)) {
    // Rows the generic table reader cannot see (the conversation table has another shape).
    const c = { id, group: groupOf(id), utterance: patch.conversation ? patch.conversation.say : "", doc: "", entry: null };
    byId.set(id, c);
    cases.push(c);
  }
  return Object.assign(byId.get(id), patch);
};

// Rows with more than one expense, written out by hand.
const E = (amount, description, payment = "UPI", dayOffset = 0) => ({ amount, description, payment, dayOffset });
set(51, { entries: [E(300, "lunch"), E(150, "coffee")] });
set(52, { entries: [E(200, "breakfast"), E(300, "lunch"), E(400, "dinner")] });
set(53, { entries: [E(120, "coffee"), E(80, "snacks")] });
set(54, { entries: [E(250, "lunch"), E(100, "chai"), E(150, "snacks")] });
set(55, { entries: [E(500, "groceries"), E(200, "toiletries")] });
set(56, { entries: [E(300, "lunch", "Cash"), E(100, "coffee", "Cash")] });
set(57, { entries: [E(400, "dinner", "UPI", -1), E(100, "dessert", "UPI", -1)] });
set(58, { entries: [E(150, "breakfast"), E(80, "coffee"), E(250, "lunch")] });
set(59, { entries: [E(200, "chai"), E(600, "groceries", "Cash")] });
set(60, { entries: [E(300, "lunch", "Cash"), E(500, "dinner", "Cash")] });
set(92, { entries: [E(120, "chai"), E(300, "breakfast")] });
set(97, { entries: [E(300, "lunch"), E(180, "coffee")] });
set(99, { entries: [E(200, "coffee"), E(300, "lunch", "UPI", -1)] });
set(100, { entries: [E(300, "lunch", "Cash"), E(180, "coffee")] });

// Corrections spoken as a separate capture: needs the previous entries.
const conv = (before, say, after) => ({ conversation: { before, say, after } });
set(61, conv([E(300, "lunch")], "Actually, lunch was 350.", [E(350, "lunch")]));
set(62, conv([E(150, "coffee")], "Actually, make that 180.", [E(180, "coffee")]));
set(63, conv([E(500, "dinner")], "No, wait, 550.", [E(550, "dinner")]));
set(64, conv([E(250, "lunch")], "That's 280 actually.", [E(280, "lunch")]));
set(65, conv([E(400, "groceries")], "I mean 450.", [E(450, "groceries")]));
set(66, conv([E(200, "coffee")], "The coffee was 220.", [E(220, "coffee")]));
set(67, conv([E(300, "lunch"), E(150, "coffee")], "Actually, the coffee was 180.", [E(300, "lunch"), E(180, "coffee")]));
set(68, conv([E(500, "dinner")], "No, I paid 600.", [E(600, "dinner")]));
set(69, conv([E(250, "lunch")], "Change that to 300.", [E(300, "lunch")]));
set(70, conv([E(100, "chai")], "Actually, make it 120 cash.", [E(120, "chai", "Cash")]));

// Ambiguity: scored on not guessing. `clarify: true` means a review (or a blank) is the right answer.
for (const id of [81, 82, 85, 86, 87]) set(id, { clarify: true });
set(83, { amountOnly: 500 });
set(84, { amountOnly: 300 });
set(90, { amountOnly: 300 });
set(88, { entries: [E(500, "dinner")] });
set(89, { entries: [E(200, "coffee")], clarifyOk: true });

// Needs a date the document gives as a calendar day: scored as "a past date was resolved".
set(49, { entry: { amount: 900, payment: "UPI", dayOffset: null, calendar: "September 3rd" } });

const out = cases
  .sort((a, b) => a.id - b.id)
  .map((c) => {
    const entries = c.entries ?? (c.conversation || c.clarify ? undefined : [c.entry]);
    const tags = [c.group];
    if (c.id >= 41 && c.id <= 50 || [57, 91, 92, 93, 95, 98, 99, 100].includes(c.id)) tags.push("needs-spoken-dates");
    if (c.conversation || [85, 86].includes(c.id)) tags.push("needs-correction");
    if (c.id >= 101) tags.push("hinglish-numbers");
    return {
      id: c.id,
      group: c.group,
      tags,
      utterance: c.utterance,
      expect: c.conversation
        ? { conversation: c.conversation.conversation ?? c.conversation }
        : c.clarify
          ? { clarify: true }
          : c.amountOnly != null
            ? { amountOnly: c.amountOnly }
            : { entries, ...(c.clarifyOk ? { clarifyOk: true } : {}) },
      doc: c.doc,
    };
  });

if (out.length !== 120) {
  console.error(`expected 120 cases, parsed ${out.length}; missing:`, [...Array(120)].map((_, i) => i + 1).filter((n) => !out.some((c) => c.id === n)).join(" "));
  process.exit(1);
}
writeFileSync(join(root, "qa", "voice-cases.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`wrote qa/voice-cases.json: ${out.length} cases`);
const tagCount = {};
for (const c of out) for (const t of c.tags) tagCount[t] = (tagCount[t] ?? 0) + 1;
console.log(tagCount);

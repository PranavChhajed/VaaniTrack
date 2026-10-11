import { isNumberWord, readAmounts, tokenise } from "./amounts";
import { finishRows } from "./finish";
import { itemKind, itemKindWhole, type IconKind } from "./icon";
import type { ExtractedTransaction, PaymentMethod } from "./types";

/**
 * The plainest expenses, read without a language model.
 *
 * "250 lunch", "two fifty chai paid cash", "spent 120 on auto yesterday". A
 * sentence that is one amount and a known item, with at most a way of paying and a
 * day, has nothing for a model to work out, and a model is where most of the wait
 * is (about 1.6 s of a 2.8 s capture). This answers those in a few milliseconds
 * and returns null for everything else, which then goes to the model as before.
 *
 * The rule that keeps it safe is that it refuses easily. It takes a sentence only
 * if every word in it is accounted for: the amount, a filler ("spent", "on",
 * "for"), a way of paying, a day, or an item the app already knows (the same
 * vocabulary that picks a row's icon). One word it cannot place, a person's name,
 * a second amount, "and", "no wait", "to", and it returns null. Same
 * `finishRows` as the model path, so the amount is read twice and the said/inferred
 * judgements are the same.
 *
 * Whether it is as right as the model is not argued here: scripts/eval.ts runs
 * both on every case and on the real transcripts, and this ships only while they agree.
 */

/** Words that say "an expense", and nothing about which one. */
const FILLER = new Set([
  "i", "me", "my", "we", "spent", "spend", "paid", "pay", "paying", "got", "get", "bought", "buy",
  "for", "on", "in", "at", "a", "an", "the", "of", "was", "were", "is", "it", "its", "that", "this",
  "just", "about", "around", "approximately", "roughly", "like", "uh", "um", "so", "yeah", "ok",
  "okay", "only", "total", "worth", "expense", "using", "with", "by", "via", "through", "my",
  "had", "have", "rupee", "rupees", "ka", "ki", "ke", "me", "mein", "hai", "tha",
]);

const PAYMENT: [RegExp, PaymentMethod][] = [
  [/\bcash\b/, "Cash"],
  [/\b(credit|debit)? ?card\b/, "Card"],
  [/\b(upi|google ?pay|gpay|phone ?pe|paytm|bhim)\b/, "UPI"],
];

/** The day words it will take, and nothing looser. */
const DAY = new RegExp(
  [
    "day before yesterday", "yesterday", "last night", "last evening", "this morning",
    "this afternoon", "this evening", "tonight", "today",
    "(?:\\d+|a|one|two|three|four|five|six|seven|eight|nine|ten) days? ago",
    "last (?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)",
    "on (?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)",
  ].join("|"),
);

/** Anything that makes a sentence more than "an amount and an item". */
const STOP = new Set([
  "to", "from", "no", "not", "wait", "actually", "sorry", "and", "then", "also", "each", "per",
  "split", "borrowed", "lent", "owe", "owed", "gave", "give", "given", "sent", "send", "received",
  "refund", "back", "instead", "mean", "make", "change", "tomorrow", "next", "week", "month",
  "year", "ago", "last", "ke", "liye", "dena",
]);

const CATEGORY: Partial<Record<IconKind, string>> = {
  food: "food", drink: "food", transport: "transport", shopping: "shopping", bills: "bills",
};

export type QuickResult = {
  transactions: ExtractedTransaction[];
  amountChecks: ("match" | "mismatch" | "unread")[];
};

export function quickParse(text: string, today: string, defaultPayment: PaymentMethod): QuickResult | null {
  // "yesterday's lunch" is "yesterday lunch" here.
  const heard = text.toLowerCase().replace(/([a-z])['’]s\b/g, "$1").replace(/\s+/g, " ").trim();
  if (!heard || heard.length > 90) return null;

  // Exactly one amount, read one way.
  const reads = readAmounts(heard);
  const distinct = [...new Set(reads.map((r) => r.value))];
  if (distinct.length !== 1) {
    // A bare "2.50" offers two readings of itself; that is a question for the model.
    return null;
  }
  const amount = distinct[0];

  // The day, if one was said, taken out first so its words do not look like an item.
  let rest = heard;
  let dateWords: string | null = null;
  const day = DAY.exec(rest);
  if (day) {
    dateWords = day[0];
    rest = `${rest.slice(0, day.index)} ${rest.slice(day.index + day[0].length)}`;
  }

  // The way of paying, taken out the same way.
  let paymentMethod: string | null = null;
  for (const [pattern, method] of PAYMENT) {
    const m = pattern.exec(rest);
    if (m) {
      if (paymentMethod && paymentMethod !== method) return null;
      paymentMethod = method;
      rest = `${rest.slice(0, m.index)} ${rest.slice(m.index + m[0].length)}`;
    }
  }

  // What is left must be fillers and known items, and nothing else.
  const words = tokenise(rest)
    .filter((t) => t.kind === "word")
    .map((t) => t.text)
    .filter((w) => !isNumberWord(w) && !FILLER.has(w));
  if (words.length > 3) return null;
  const items: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (STOP.has(w)) return null;
    const pair = words[i + 1] ? `${w} ${words[i + 1]}` : null;
    const pairBefore = i > 0 ? `${words[i - 1]} ${w}` : null;
    // A word counts only if it is a whole item, alone or as half of a two-word one ("ice cream").
    if (itemKindWhole(w) !== null || (pair && itemKindWhole(pair) !== null) || (pairBefore && itemKindWhole(pairBefore) !== null)) {
      items.push(w);
    } else {
      return null; // a word it cannot place: a name, a thing it does not know
    }
  }
  // "and" is part of an amount ("two hundred and fifty") only between number words;
  // anywhere else it joins two things, and two things are the model's to separate.
  const around = tokenise(rest);
  for (let i = 0; i < around.length; i++) {
    if (around[i].text !== "and") continue;
    const numeric = (t?: { kind: string; text: string }) => !!t && (t.kind === "num" || isNumberWord(t.text));
    if (!(numeric(around[i - 1]) && numeric(around[i + 1]))) return null;
  }

  // An amount with no item is the model’s to judge: it may be a correction ("that was 200") or a bare payment.
  if (items.length === 0) return null;
  const description = items.join(" ");
  const kind = itemKind(description);
  const finished = finishRows(
    [{
      amount,
      description,
      category: kind ? (CATEGORY[kind] ?? null) : null,
      payee: null,
      paymentMethod,
      dateWords,
      time: null,
      ask: null,
    }],
    text,
    today,
    defaultPayment,
  );
  const only = finished.transactions[0];
  // A reading the code itself could not stand behind goes to the model.
  if (!only || only.amount === null || only.amountProvenance !== "said" || only.needsConfirmation) return null;
  return finished;
}

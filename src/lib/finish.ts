import { checkAmount, readAmounts } from "./amounts";
import { resolveDateWords } from "./dates";
import { PAYMENT_OPTIONS, type ExtractedTransaction, type PaymentMethod, type Provenance } from "./types";

/**
 * Finishes what the model returned.
 *
 * The model is asked only for values: an amount, the words for the thing, the
 * payment method if one was said, the *words* about the day. Everything that is a
 * judgement about those values is made here, in code, against the transcript:
 *
 *   - whether each value was `said` or only `inferred`: checked by looking for it
 *     in the transcript, not by taking the model's word for it;
 *   - whether the amount is right: read again from the transcript by
 *     `amounts.ts`, and a disagreement becomes a question, never a silent save;
 *   - which day was meant: worked out from the speaker's own date by `dates.ts`;
 *   - the defaults for what was not said.
 *
 * That makes the model's reply about half as long (no provenance fields), which
 * is most of what makes a reply slow, and it removes the failure where a model
 * claims "said" for something nobody said.
 */

/** One entry as the model writes it. Every key may be missing or null. */
export type ModelRow = {
  amount?: unknown;
  description?: unknown;
  category?: unknown;
  payee?: unknown;
  paymentMethod?: unknown;
  dateWords?: unknown;
  time?: unknown;
  ask?: unknown;
};

const text = (v: unknown, max = 80): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t && t.toLowerCase() !== "null" && t.toLowerCase() !== "none" ? t.slice(0, max) : null;
};

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();

/** Whether what the model wrote is something the speaker actually said. */
export function wasSaid(value: string | null, transcript: string): boolean {
  if (!value) return false;
  const heard = ` ${norm(transcript)} `;
  const words = norm(value).split(" ").filter((w) => w.length > 1);
  if (words.length === 0) return false;
  // Every word, allowing a plural or a stem: "chai" for "chais", "parking" for "park".
  return words.every((w) => heard.includes(` ${w} `) || heard.includes(` ${w}`) || (w.length > 4 && heard.includes(` ${w.slice(0, -1)}`)));
}

const PAYMENT_WORDS: [RegExp, PaymentMethod][] = [
  [/\bcash\b|\bnaqd\b/, "Cash"],
  [/\bcard\b|\bcredit\b|\bdebit\b|\bvisa\b|\bmastercard\b/, "Card"],
  [/\bupi\b|\bgoogle ?pay\b|\bgpay\b|\bphone ?pe\b|\bpaytm\b|\bbhim\b|\bnet ?banking\b|\bimps\b|\bneft\b/, "UPI"],
];

/** Whether the transcript names this way of paying, in any of the words people use for it. */
export function mentionsPayment(method: string, transcript: string): boolean {
  const t = transcript.toLowerCase();
  const known = PAYMENT_WORDS.find(([, m]) => m.toLowerCase() === method.toLowerCase());
  return known ? known[0].test(t) : wasSaid(method, transcript);
}

/** What the model called a way of paying, as one of the app’s options when it is one. */
const canonicalPayment = (v: string): string => PAYMENT_OPTIONS.find((p) => p.toLowerCase() === v.toLowerCase()) ?? v;

/** "5 pm", "5:30", "at five", "quarter to six": a clock time said aloud, as the model wrote it. */
const CLOCK_SAID = /\b\d{1,2}(:\d{2})?\s?(am|pm|o'?clock)\b|\b\d{1,2}:\d{2}\b|\bat (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i;

export type Finished = {
  transactions: ExtractedTransaction[];
  /** Per entry, what the cross-check found. For the log and the scoreboard. */
  amountChecks: ("match" | "mismatch" | "unread")[];
};

export function finishRows(
  rows: unknown,
  transcript: string,
  today: string,
  defaultPayment: PaymentMethod,
): Finished {
  const list: ModelRow[] = Array.isArray(rows)
    ? rows.filter((r): r is ModelRow => typeof r === "object" && r !== null)
    : [];
  const reads = readAmounts(transcript);
  const out: ExtractedTransaction[] = [];
  const checks: Finished["amountChecks"] = [];

  for (const row of list) {
    const rawAmount = typeof row.amount === "number" && Number.isFinite(row.amount) && row.amount >= 0 ? row.amount : null;
    const amount = rawAmount === null ? null : Math.round(rawAmount * 100) / 100;
    const check = checkAmount(amount, reads);
    checks.push(check);

    const description = text(row.description);
    const category = text(row.category, 40);
    const payee = text(row.payee, 60);
    const ask = text(row.ask, 160);
    const dateWords = text(row.dateWords, 60);
    const clock = text(row.time, 20);

    let needsConfirmation = ask !== null;
    let confirmationReason = ask;

    // The amount: said only when the transcript itself reads to the same number.
    let amountProvenance: Provenance = "unknown";
    if (amount !== null) {
      if (check === "match") amountProvenance = "said";
      else {
        amountProvenance = "inferred";
        if (check === "mismatch") {
          needsConfirmation = true;
          const heard = [...new Set(reads.map((r) => r.value))].slice(0, 3).join(" or ");
          confirmationReason = `The words say ${heard}, but it was read as ${amount}. Check the amount.`;
        }
      }
    } else {
      needsConfirmation = true;
      confirmationReason ??= "Didn’t catch the amount. What was it?";
    }

    // Payment, per entry: the model says which way each was paid, and it counts only
    // if the transcript really names that way. "groceries was cash" can differ from the chai.
    const modelPayment = text(row.paymentMethod, 20);
    const canon = modelPayment ? canonicalPayment(modelPayment) : null;
    const paymentSaid = canon !== null && mentionsPayment(canon, transcript);
    const paymentMethod: string = paymentSaid ? canon : defaultPayment;

    // The day: the words are the model's, the date is code's.
    let date: string | null = today;
    let dateProvenance: Provenance = "default";
    if (dateWords) {
      const resolved = resolveDateWords(dateWords, today);
      if (resolved && wasSaid(dateWords.replace(/\d+(st|nd|rd|th)?/g, "").trim() || dateWords, transcript)) {
        date = resolved.date; dateProvenance = "said";
      } else {
        date = null; dateProvenance = "unknown";
        needsConfirmation = true;
        confirmationReason ??= `Didn’t catch which day “${dateWords}” was. When was it?`;
      }
    }

    // A clock time only if the speaker said one; never a model's guess.
    const timeSaid = clock !== null && CLOCK_SAID.test(transcript);

    out.push({
      amount,
      amountProvenance,
      description,
      descriptionProvenance: description ? (wasSaid(description, transcript) ? "said" : "inferred") : "unknown",
      category,
      categoryProvenance: category ? (wasSaid(category, transcript) ? "said" : "inferred") : "unknown",
      payee,
      payeeProvenance: payee ? (wasSaid(payee, transcript) ? "said" : "inferred") : "unknown",
      paymentMethod,
      paymentMethodProvenance: paymentSaid ? "said" : "default",
      date,
      dateProvenance,
      time: timeSaid ? clock : null,
      timeProvenance: timeSaid ? "said" : "unknown",
      needsConfirmation,
      confirmationReason: needsConfirmation ? confirmationReason : null,
    });
  }
  return { transactions: out, amountChecks: checks };
}

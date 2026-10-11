/**
 * Reads the amounts out of a transcript, without a language model.
 *
 * Why this exists: the amount is the one field that must not be wrong, and until
 * now a single model both heard the number's *meaning* and vouched for it. This is
 * a second, independent reader: plain code, the same answer every time, tested to
 * the last form. `checkAmount` compares it with what the model returned. If the
 * two disagree the entry goes to review; it is never saved silently.
 *
 * It also replaces `hasNumber` in asr.ts, whose word list stopped at "twelve" and
 * so rejected "chai was fifteen rupees" as having no amount at all.
 *
 * What it reads (English, as Indians say it):
 *   250   1,250   12,50,000   Rs 250   250rs   ₹250/-   2.5k   1.5 lakh
 *   two fifty (250)   seven fifty (750)   one twenty (120)   fifteen hundred (1500)
 *   two hundred and fifty   one thousand two hundred   one lakh twenty thousand
 *   two and a half thousand   half a lakh   one point five lakh
 *   "$2.50" and a bare "2.50": the transcriber writing a spoken "two fifty" as a
 *   price. Everything here is rupees, so these are read as the digits spoken (250).
 * and the few Hindi forms the extraction prompt already claims: dhai sau, dedh
 * sau, sava sau, paune do sau, saadhe teen hazaar, aadha lakh, with Hindi one to
 * ten and the round tens. The rest of Hindi number speech is the second phase.
 *
 * What it deliberately does not read: a number that is not an amount (a date's
 * "3rd", "5 pm", "2 days ago", "3 kg"). Those would only let a wrong answer
 * agree with a coincidence.
 */

export type AmountForm = "digits" | "suffix" | "words" | "fraction" | "artefact";

export type AmountRead = {
  value: number;
  form: AmountForm;
  /** The words or digits it came from, for the log. */
  from: string;
};

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  // Hindi, one to nine (ten is in TEENS)
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6, chhah: 6,
  saat: 7, aath: 8, nau: 9,
};
const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, das: 10,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80,
  ninety: 90,
  // Hindi round tens
  bees: 20, tees: 30, chalis: 40, pachas: 50, pachaas: 50, paachas: 50, paanchas: 50,
  saath: 60, sattar: 70, assi: 80, nabbe: 90,
};
const HUNDRED = new Set(["hundred", "sau"]);
const MULT: Record<string, number> = {
  thousand: 1_000, hazaar: 1_000, hazar: 1_000, k: 1_000,
  lakh: 100_000, lakhs: 100_000, lac: 100_000, lacs: 100_000,
  crore: 10_000_000, crores: 10_000_000, cr: 10_000_000, karod: 10_000_000,
  hundred: 100, sau: 100,
};
/** Hindi fractions that multiply what follows: "dhai sau" is two and a half hundred. */
const FRACTION: Record<string, number> = {
  dedh: 1.5, dhedh: 1.5, derh: 1.5, dhai: 2.5, adhai: 2.5, dhaai: 2.5, sava: 1.25, sawa: 1.25,
  aadha: 0.5, adha: 0.5, aadhe: 0.5,
};
const CURRENCY = new Set([
  "rs", "inr", "rupee", "rupees", "rupaye", "rupaya", "rupiya", "rupay", "bucks", "buck", "₹",
]);
/** A number followed by one of these is a date, a time or a quantity, not an amount. */
const NOT_MONEY_AFTER = new Set([
  "st", "nd", "rd", "th", "am", "pm", "oclock", "day", "days", "hour", "hours", "minute",
  "minutes", "min", "mins", "week", "weeks", "month", "months", "year", "years", "time", "times",
  "kg", "kgs", "km", "kms", "gm", "gms", "gram", "grams", "litre", "litres", "liter", "liters",
  "ml", "piece", "pieces", "pcs", "item", "items", "people", "person", "persons", "plate", "plates",
  "cup", "cups", "ago", "percent",
]);
const MONTHS = new Set([
  "january", "february", "march", "april", "may", "june", "july", "august", "september",
  "october", "november", "december", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep",
  "sept", "oct", "nov", "dec",
]);

export type Token = { kind: "num" | "word" | "punct"; text: string };

export function tokenise(text: string): Token[] {
  const out: Token[] = [];
  const pattern = /\d+(?:,\d{2,3})*(?:\.\d+)?|[a-z]+|\S/g;
  for (const match of text.toLowerCase().replace(/₹/g, " rs ").replace(/\/-/g, " ").matchAll(pattern)) {
    const t = match[0];
    out.push({ kind: /^\d/.test(t) ? "num" : /^[a-z]/.test(t) ? "word" : "punct", text: t });
  }
  return out;
}

const digitsValue = (text: string) => Number(text.replace(/,/g, ""));

function smallNumberAt(tokens: Token[], i: number): { value: number; next: number } | null {
  const t = tokens[i];
  if (!t) return null;
  if (t.kind === "num") {
    const v = digitsValue(t.text);
    return Number.isFinite(v) && v < 1000 ? { value: v, next: i + 1 } : null;
  }
  if (t.kind !== "word") return null;
  if (t.text in UNITS) return { value: UNITS[t.text], next: i + 1 };
  if (t.text in TEENS) return { value: TEENS[t.text], next: i + 1 };
  if (t.text in TENS) {
    const unit = tokens[i + 1]?.kind === "word" ? UNITS[tokens[i + 1].text] : undefined;
    return unit !== undefined && unit > 0
      ? { value: TENS[t.text] + unit, next: i + 2 }
      : { value: TENS[t.text], next: i + 1 };
  }
  return null;
}

const multAt = (tokens: Token[], i: number): number | null => {
  const t = tokens[i];
  return t && t.kind === "word" && t.text in MULT ? MULT[t.text] : null;
};

/** "dhai sau", "paune do sau", "saadhe teen hazaar", "half a lakh". */
function fractionAt(tokens: Token[], i: number): { value: number; next: number } | null {
  const t = tokens[i];
  if (!t || t.kind !== "word") return null;

  if (t.text in FRACTION) {
    const m = multAt(tokens, i + 1);
    return m ? { value: FRACTION[t.text] * m, next: i + 2 } : null;
  }
  if (t.text === "half") {
    let at = i + 1;
    if (tokens[at]?.text === "a" || tokens[at]?.text === "an") at++;
    const m = multAt(tokens, at);
    return m ? { value: 0.5 * m, next: at + 1 } : null;
  }
  if (t.text === "paune" || t.text === "saadhe" || t.text === "sadhe") {
    const n = smallNumberAt(tokens, i + 1);
    const m = n ? multAt(tokens, n.next) : null;
    if (!n || !m) return null;
    const base = t.text === "paune" ? n.value - 0.25 : n.value + 0.5;
    return { value: base * m, next: n.next + 1 };
  }
  return null;
}

/** "two and a half thousand", "2 and a half lakh". */
function andAHalf(tokens: Token[], i: number, whole: number): { value: number; next: number } | null {
  if (tokens[i]?.text !== "and") return null;
  let at = i + 1;
  if (tokens[at]?.text === "a" || tokens[at]?.text === "an") at++;
  if (tokens[at]?.text !== "half") return null;
  const m = multAt(tokens, at + 1);
  return m ? { value: (whole + 0.5) * m, next: at + 2 } : null;
}

/** The English (and basic Hindi) number-word grammar, one number starting at i. */
function wordsAt(tokens: Token[], i: number): { value: number; next: number } | null {
  let total = 0;
  let cur = 0;
  let last: "unit" | "teen" | "tens" | "hundred" | "mult" | null = null;
  let j = i;
  let any = false;

  for (; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.kind !== "word") break;
    const w = t.text;

    if (w === "and") {
      // "two hundred and fifty": only between number words.
      const nextWord = tokens[j + 1];
      if (any && nextWord?.kind === "word" && (nextWord.text in UNITS || nextWord.text in TEENS || nextWord.text in TENS)) continue;
      break;
    }
    if ((w === "a" || w === "an") && !any) {
      const m = tokens[j + 1];
      if (m && m.kind === "word" && (HUNDRED.has(m.text) || (m.text in MULT && m.text !== "k"))) {
        cur = 1; last = "unit"; any = true;
        continue;
      }
      break;
    }
    if ((w === "oh" || w === "o") && last === "unit" && cur >= 1 && cur <= 9) {
      const unit = tokens[j + 1];
      if (unit?.kind === "word" && unit.text in UNITS && UNITS[unit.text] > 0) {
        cur = cur * 100 + UNITS[unit.text];
        last = "tens"; j++;
        continue;
      }
      break;
    }
    if (w in UNITS && w !== "zero") {
      if (last === "unit" || last === "teen") break;
      cur += UNITS[w]; last = "unit"; any = true;
      continue;
    }
    if (w in TEENS) {
      if (last === "unit" || last === "teen" || last === "tens") break;
      cur += TEENS[w]; last = "teen"; any = true;
      continue;
    }
    if (w in TENS) {
      if (last === "tens") break;
      if ((last === "unit" || last === "teen") && cur >= 1 && cur <= 19) {
        // "two fifty" is 250 and "twelve fifty" is 1250: a small number then a
        // tens word is hundreds then tens. Said this way by nearly every Indian
        // speaker, and the reason "$2.50" exists at all.
        cur = cur * 100 + TENS[w];
      } else {
        cur += TENS[w];
      }
      last = "tens"; any = true;
      continue;
    }
    if (HUNDRED.has(w)) {
      if (last === "hundred") break;
      cur = (cur || 1) * 100; last = "hundred"; any = true;
      continue;
    }
    if (w in MULT && w !== "k" && w !== "cr") {
      if (last === "mult" && cur === 0) break;
      total += (cur || 1) * MULT[w]; cur = 0; last = "mult"; any = true;
      continue;
    }
    if (w === "point" && any) {
      const digits: string[] = [];
      let k = j + 1;
      while (tokens[k]) {
        const d = tokens[k];
        if (d.kind === "num" && /^\d$/.test(d.text)) digits.push(d.text);
        else if (d.kind === "word" && d.text in UNITS) digits.push(String(UNITS[d.text]));
        else break;
        k++;
      }
      if (digits.length === 0) break;
      const whole = total + cur + Number(`0.${digits.join("")}`);
      const m = multAt(tokens, k);
      return m ? { value: Math.round(whole * m * 100) / 100, next: k + 1 } : { value: whole, next: k };
    }
    break;
  }
  if (!any) return null;

  // "two and a half thousand"
  const half = andAHalf(tokens, j, total + cur);
  if (half) return half;
  return { value: total + cur, next: j };
}

/** Whether a word belongs to how an amount is spoken, so a caller can set the amount’s words aside. */
export function isNumberWord(w: string): boolean {
  return (
    w in UNITS || w in TEENS || w in TENS || HUNDRED.has(w) || w in MULT || w in FRACTION ||
    CURRENCY.has(w) || ["and", "point", "half", "paune", "saadhe", "sadhe", "oh"].includes(w)
  );
}

/** Every amount in the text, in the order spoken. */
export function readAmounts(text: string): AmountRead[] {
  const reads: AmountRead[] = [];

  // "$2.50" is "two fifty" written as a price. Done on the raw text because the
  // dollar sign is dropped by the tokeniser. Rule: the digits that were spoken.
  const rest = text.replace(/\$\s*(\d{1,2})\.(\d{2})\b(?!\d)/g, (all, whole: string, cents: string) => {
    reads.push({ value: Number(whole) * 100 + Number(cents), form: "artefact", from: all.trim() });
    return " ";
  }).replace(/\$\s*(\d[\d,]*(?:\.\d+)?)/g, (_all, n: string) => ` ${n} `);

  const tokens = tokenise(rest);
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];

    if (t.kind === "punct" || (t.kind === "word" && CURRENCY.has(t.text))) { i++; continue; }

    // Digits.
    if (t.kind === "num") {
      const n = digitsValue(t.text);
      const after = tokens[i + 1];
      const before = tokens[i - 1];
      const monthBefore = before?.kind === "word" && MONTHS.has(before.text);
      const notMoney = after?.kind === "word" && NOT_MONEY_AFTER.has(after.text);
      if (monthBefore || notMoney) { i += notMoney ? 2 : 1; continue; }

      // "2.5k", "1.5 lakh", "5 hundred", "2 thousand"
      const m = multAt(tokens, i + 1);
      if (m && Number.isFinite(n)) {
        reads.push({ value: Math.round(n * m * 100) / 100, form: "suffix", from: `${t.text} ${after.text}` });
        i += 2;
        continue;
      }
      const half = andAHalf(tokens, i + 1, n);
      if (half) { reads.push({ value: half.value, form: "fraction", from: t.text }); i = half.next; continue; }

      if (Number.isFinite(n)) {
        // A bare "2.50" is the transcriber's price for "two fifty". Both readings
        // are kept, so a model that read it literally still agrees with something.
        const artefact = /^(\d{1,2})\.(\d{2})$/.exec(t.text);
        if (artefact) {
          reads.push({ value: Number(artefact[1]) * 100 + Number(artefact[2]), form: "artefact", from: t.text });
        }
        reads.push({ value: n, form: "digits", from: t.text });
      }
      i++;
      continue;
    }

    // Words.
    const frac = fractionAt(tokens, i);
    if (frac) {
      reads.push({ value: frac.value, form: "fraction", from: tokens.slice(i, frac.next).map((x) => x.text).join(" ") });
      i = frac.next;
      continue;
    }
    const w = wordsAt(tokens, i);
    if (w && w.next > i) {
      const after = tokens[w.next];
      const notMoney = after?.kind === "word" && NOT_MONEY_AFTER.has(after.text);
      if (!notMoney) {
        reads.push({ value: w.value, form: "words", from: tokens.slice(i, w.next).map((x) => x.text).join(" ") });
      }
      i = w.next;
      continue;
    }
    i++;
  }
  return reads;
}

/**
 * Whether the transcript has any amount in it. What `hasNumber` in asr.ts did,
 * with the whole number vocabulary behind it instead of a short list.
 */
export function hasAmount(text: string): boolean {
  return /\d/.test(text) || readAmounts(text).length > 0;
}

export type AmountCheck =
  | "match" // the model's amount is one the code read too
  | "mismatch" // the code read amounts, and none of them is the model's
  | "unread"; // nothing to compare: no amount from the model, or none the code could read

/** Compare the model's amount with the transcript. Only "mismatch" is a problem. */
export function checkAmount(modelAmount: number | null, reads: AmountRead[]): AmountCheck {
  if (modelAmount === null || reads.length === 0) return "unread";
  return reads.some((r) => Math.abs(r.value - modelAmount) < 0.005) ? "match" : "mismatch";
}

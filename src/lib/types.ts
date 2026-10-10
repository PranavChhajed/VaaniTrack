import { readLocal, writeLocal } from "./localStore";

/**
 * Core types for VaaniTrack.
 *
 * The design constraint that shapes this file is FR-10 (per-field
 * provenance) combined with FR-9 (never fabricate). Every field
 * records not just its value but where that value came from, because
 * the review card has to show the user which numbers they actually
 * said and which ones the system supplied.
 *
 * See docs/PRD-VaaniTrack.md §7.4.
 */

/** Where a field's value came from. Order matters: explicit beats
 *  inferred beats default, and unknown is always a legitimate outcome. */
export type Provenance = "said" | "inferred" | "default" | "unknown";

export interface Field<T> {
  value: T | null;
  provenance: Provenance;
}

export interface Transaction {
  id: string;
  amount: Field<number>;
  description: Field<string>;
  /** Nullable by decision. An empty category is acceptable and must
   *  never be guessed to avoid a blank; PRD FR-1, FR-11. */
  category: Field<string>;
  /** A person, when the utterance names one ("Paid 500 to Rahul"). */
  payee: Field<string>;
  paymentMethod: Field<string>;
  /** ISO date, YYYY-MM-DD. */
  date: Field<string>;
  /** Not a v1 capture requirement. Stored only if explicitly said,
   *  never inferred, never fabricated; PRD §7.4. */
  time: Field<string>;
  createdAt: string;
  source: "voice" | "manual";
  /** The raw transcript this came from, kept for the review card. */
  transcript?: string;
}

/** What the extraction stage returns before it becomes a Transaction. */
export interface ExtractedTransaction {
  amount: number | null;
  amountProvenance: Provenance;
  description: string | null;
  descriptionProvenance: Provenance;
  category: string | null;
  categoryProvenance: Provenance;
  payee: string | null;
  payeeProvenance: Provenance;
  paymentMethod: string | null;
  paymentMethodProvenance: Provenance;
  date: string | null;
  dateProvenance: Provenance;
  time: string | null;
  timeProvenance: Provenance;
  /** True when the utterance is too ambiguous to record without
   *  asking, e.g. a bare amount and a person, with no verb.
   *  PRD FR-1: "250 to Pushpa" confirms, "Paid 500 to Rahul" does not. */
  needsConfirmation: boolean;
  confirmationReason: string | null;
}

export interface ExtractionResult {
  transactions: ExtractedTransaction[];
  transcript: string;
}

/** What a payment method can be filed as when none was spoken. A spoken one
 *  ("paid by PhonePe") is stored as said and is not limited to these. */
export const PAYMENT_OPTIONS = ["UPI", "Cash", "Card"] as const;
export type PaymentMethod = (typeof PAYMENT_OPTIONS)[number];

/** The out-of-the-box defaults. Payment method is the starting point of the
 *  setting on the You screen (`lib/settings.ts`), not a fixed fact. */
export const DEFAULTS = {
  paymentMethod: "UPI" as PaymentMethod,
  currency: "₹",
} as const;

const EMPTY = <T>(): Field<T> => ({ value: null, provenance: "unknown" });

export function toTransaction(
  e: ExtractedTransaction,
  transcript: string,
  source: Transaction["source"],
): Transaction {
  const field = <T>(value: T | null, provenance: Provenance): Field<T> =>
    value === null || value === undefined ? EMPTY<T>() : { value, provenance };

  return {
    id: crypto.randomUUID(),
    amount: field(e.amount, e.amountProvenance),
    description: field(e.description, e.descriptionProvenance),
    category: field(e.category, e.categoryProvenance),
    payee: field(e.payee, e.payeeProvenance),
    paymentMethod: field(e.paymentMethod, e.paymentMethodProvenance),
    date: field(e.date, e.dateProvenance),
    time: field(e.time, e.timeProvenance),
    createdAt: new Date().toISOString(),
    source,
    transcript,
  };
}

export const TRANSACTIONS_KEY = "vaanitrack.transactions";

const PROVENANCES: readonly Provenance[] = ["said", "inferred", "default", "unknown"];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** One field of a stored record, whatever state it is in. */
function readField<T>(raw: unknown, read: (v: unknown) => T | null): Field<T> {
  if (!isRecord(raw)) return EMPTY<T>();
  const value = read(raw.value);
  if (value === null) return EMPTY<T>();
  const provenance = PROVENANCES.find((p) => p === raw.provenance) ?? "unknown";
  return { value, provenance };
}

const readText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

const readAmount = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** A real calendar day, or nothing. "2026-02-31" is not one. */
const readDay = (v: unknown): string | null => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const [y, m, day] = v.split("-").map(Number);
  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day ? v : null;
};

/**
 * One stored record made safe to use, or null if there is nothing in it.
 *
 * The journal is read from browser storage, where anything can be: an older
 * version's shape, a write that was cut off, a hand edit. Every screen reads
 * these fields without checking, so a single `null` in the list used to be
 * enough to stop the whole app with "This page couldn't load", and the only
 * way out was to clear the site's data, which is the journal itself. A record
 * is rebuilt field by field instead, keeping what is real and dropping what is
 * not, and a record with no amount, no description and no payee has nothing
 * worth keeping.
 */
export function sanitizeTransaction(raw: unknown, index: number): Transaction | null {
  if (!isRecord(raw)) return null;
  const amount = readField(raw.amount, readAmount);
  const description = readField(raw.description, readText);
  const payee = readField(raw.payee, readText);
  if (amount.value === null && description.value === null && payee.value === null) return null;

  const created = typeof raw.createdAt === "string" && !Number.isNaN(Date.parse(raw.createdAt));
  return {
    id: typeof raw.id === "string" && raw.id !== "" ? raw.id : `recovered-${index}`,
    amount,
    description,
    category: readField(raw.category, readText),
    payee,
    paymentMethod: readField(raw.paymentMethod, readText),
    date: readField(raw.date, readDay),
    time: readField(raw.time, readText),
    createdAt: created ? (raw.createdAt as string) : "",
    source: raw.source === "voice" ? "voice" : "manual",
    ...(typeof raw.transcript === "string" ? { transcript: raw.transcript } : {}),
  };
}

/** A journal from its stored text. Unreadable or wrongly shaped is an empty
 *  journal rather than a crash, and a damaged record is repaired or dropped
 *  rather than being allowed to take every screen down with it. */
export function parseTransactions(raw: string | null): Transaction[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: Transaction[] = [];
    parsed.forEach((item, i) => {
      const t = sanitizeTransaction(item, i);
      if (!t) return;
      // Two records sharing an id would be edited and deleted together.
      if (seen.has(t.id)) t.id = `${t.id}~${i}`;
      seen.add(t.id);
      out.push(t);
    });
    return out;
  } catch {
    return [];
  }
}

export function loadTransactions(): Transaction[] {
  return parseTransactions(readLocal(TRANSACTIONS_KEY));
}

/**
 * Write the journal. An empty one is a legitimate thing to write: it is what
 * deleting your last entry leaves. There used to be a guard here refusing to
 * overwrite a full journal with an empty one, as a backstop against two
 * components racing to hydrate. That race is gone (see useTransactions.tsx),
 * and the guard's only remaining effect was that removing the final entry
 * never persisted, so it came back on reload.
 */
export function saveTransactions(transactions: Transaction[]): void {
  writeLocal(TRANSACTIONS_KEY, JSON.stringify(transactions));
}

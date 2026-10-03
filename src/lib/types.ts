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

/** Hard-coded for the demo. No settings screen in v1; PRD FR-3. */
export const DEFAULTS = {
  paymentMethod: "UPI",
  currency: "₹",
} as const;

const EMPTY = <T>(): Field<T> => ({ value: null, provenance: "unknown" });

export function toTransaction(
  e: ExtractedTransaction,
  transcript: string,
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
    source: "voice",
    transcript,
  };
}

const STORAGE_KEY = "vaanitrack.transactions";

export function loadTransactions(): Transaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Transaction[]) : [];
  } catch {
    return [];
  }
}

export function saveTransactions(transactions: Transaction[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
    // A demo that loses history is better than one that crashes.
  }
}

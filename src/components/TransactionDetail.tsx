"use client";

import { useEffect, useState } from "react";
import {
  DEFAULTS,
  type Field,
  type Provenance,
  type Transaction,
} from "@/lib/types";
import { isFuture, parseClock, todayISO } from "@/lib/journal";
import { useSettings } from "@/lib/settings";

/**
 * Transaction detail: inspect, correct, delete (§22-§26).
 *
 * The row is built for scanning; this is built for inspection. Every stored
 * field is shown, including the ones that are empty, because "we do not know
 * the time" is itself information the user should be able to see.
 *
 * Provenance appears here and only here (§23). On a row it would be noise; on
 * the detail it answers the question a financial record has to be able to
 * answer: where did this value come from, did I say it or did the app decide
 * it?
 */

const PROVENANCE_LABEL: Record<Provenance, string> = {
  said: "You said this",
  inferred: "Worked out",
  default: "Your default",
  unknown: "Not captured",
};

/** HH:MM for a time input, from whatever shape the value was stored in. */
function toTimeInput(raw: string | null): string {
  const minutes = parseClock(raw);
  if (minutes === null) return "";
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function loggedStamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ReadField({
  label,
  field,
  fallback = "Unknown",
}: {
  label: string;
  field: Field<string | number>;
  fallback?: string;
}) {
  const empty = field.value === null || field.value === "";
  return (
    <div className="border-b border-paper-edge py-4 last:border-b-0">
      <span className="block font-figtree text-caption font-semibold uppercase tracking-[0.08em] text-fog">
        {label}
      </span>
      <span
        className={[
          "mt-1 block font-figtree text-body",
          empty ? "text-fog italic" : "text-vast-ink",
        ].join(" ")}
      >
        {empty ? fallback : field.value}
      </span>
      <span className="mt-1 block font-figtree text-caption text-fog">
        {PROVENANCE_LABEL[field.provenance]}
      </span>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  inputMode,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: "decimal" | "text";
  max?: string;
}) {
  return (
    <label className="block border-b border-paper-edge py-4 last:border-b-0">
      <span className="block font-figtree text-caption font-semibold uppercase tracking-[0.08em] text-fog">
        {label}
      </span>
      <input
        type={type}
        value={value}
        max={max}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring mt-2 w-full rounded-[var(--radius-input)] border-2 border-vast-ink bg-paper px-4 py-3 font-figtree text-body-sm text-vast-ink outline-none placeholder:text-fog focus:border-forest-ink"
      />
    </label>
  );
}

export function TransactionDetail({
  transaction,
  onSave,
  onDelete,
  onClose,
  backLabel = "Journal",
  startEditing = false,
}: {
  transaction: Transaction;
  onSave: (next: Transaction) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  /** The screen this was opened from, named on the way back to it. */
  backLabel?: string;
  /** Open straight into the form. For a row opened in order to correct it,
   *  where reading it first is a wasted tap. */
  startEditing?: boolean;
}) {
  const t = transaction;
  const { defaultPayment } = useSettings();
  const [editing, setEditing] = useState(startEditing);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState(String(t.amount.value ?? ""));
  const [description, setDescription] = useState(t.description.value ?? "");
  const [category, setCategory] = useState(t.category.value ?? "");
  const [payee, setPayee] = useState(t.payee.value ?? "");
  const [paymentMethod, setPaymentMethod] = useState(t.paymentMethod.value ?? "");
  const [date, setDate] = useState(t.date.value ?? "");
  const [time, setTime] = useState(toTimeInput(t.time.value));

  // Same treatment as DayCapture's sheet: Escape closes, and the page behind
  // stops scrolling while this is open. This is a full-screen overlay like
  // that one, but previously had none of this -- no role, no Escape, no
  // scroll lock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  /**
   * A value the user typed is a value the user said (FR-10's first state:
   * "explicitly provided by the user"). Anything left untouched keeps the
   * provenance it arrived with, so the detail view stays truthful about which
   * fields the app filled in on its own.
   */
  function settle<T>(current: Field<T>, next: T | null): Field<T> {
    const unchanged = current.value === next;
    if (unchanged) return current;
    if (next === null || next === "")
      return { value: null, provenance: "unknown" };
    return { value: next, provenance: "said" };
  }

  function save() {
    const parsedAmount = Number(amount);
    if (!amount.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("An amount is required, and it has to be a positive number.");
      return;
    }

    // §29: the product records money already spent. A future date cannot be
    // a past expense, and scheduled payments are out of scope.
    if (date && isFuture(date)) {
      setError("That date is in the future. Expenses can only be recorded for days that have happened.");
      return;
    }

    onSave({
      ...t,
      amount: settle(t.amount, parsedAmount),
      description: settle(t.description, description.trim() || null),
      category: settle(t.category, category.trim() || null),
      payee: settle(t.payee, payee.trim() || null),
      paymentMethod: settle(t.paymentMethod, paymentMethod.trim() || null),
      date: settle(t.date, date || null),
      time: settle(t.time, time || null),
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.description.value ?? t.payee.value ?? "Transaction detail"}
      className="fixed inset-0 z-50 overflow-y-auto bg-paper"
    >
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-5 py-8">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-[var(--radius-pill)] border-2 border-vast-ink bg-paper-raised px-5 py-2 font-figtree text-body-sm text-vast-ink active:bg-mint-whisper"
          >
            &lsaquo; {backLabel}
          </button>
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="focus-ring rounded-[var(--radius-pill)] border-2 border-vast-ink bg-mint-whisper px-5 py-2 font-figtree text-body-sm font-medium text-vast-ink active:bg-mint-deep"
            >
              Edit
            </button>
          ) : null}
        </div>

        <div className="rounded-[var(--radius-card)] border-2 border-vast-ink bg-paper-raised px-6 py-6">
          {!editing ? (
            <>
              <h1 className="display-type text-heading-sm text-vast-ink">
                {t.description.value ?? t.payee.value ?? "Transaction"}
              </h1>
              <p className="money mt-2 text-heading text-vast-ink">
                {DEFAULTS.currency}
                {(t.amount.value ?? 0).toLocaleString("en-IN")}
              </p>

              <div className="mt-6">
                <ReadField label="Amount" field={t.amount} />
                <ReadField label="Description" field={t.description} />
                <ReadField label="Payee" field={t.payee} fallback="No payee" />
                <ReadField label="Category" field={t.category} fallback="No category" />
                <ReadField label="Payment method" field={t.paymentMethod} />
                <ReadField label="Date" field={t.date} fallback="No date" />
                <ReadField
                  label="Time of spending"
                  field={t.time}
                  fallback="Unknown"
                />
              </div>

              {/* Kept clearly apart from "Time of spending" above. One is when
                  the money was spent; this is when the app wrote it down. */}
              <div className="mt-6 border-t-2 border-paper-edge pt-4">
                <span className="block font-figtree text-caption font-semibold uppercase tracking-[0.08em] text-fog">
                  Logged in VaaniTrack
                </span>
                <span className="mt-1 block font-figtree text-body-sm text-fog">
                  {loggedStamp(t.createdAt)}
                </span>
                {t.transcript ? (
                  <span className="mt-3 block font-figtree text-caption text-fog">
                    Heard: &ldquo;{t.transcript}&rdquo;
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <h1 className="display-type text-heading-sm text-vast-ink">
                Edit transaction
              </h1>
              <div className="mt-4">
                <EditField
                  label="Amount"
                  value={amount}
                  onChange={setAmount}
                  inputMode="decimal"
                  placeholder="250"
                />
                <EditField
                  label="Description"
                  value={description}
                  onChange={setDescription}
                  placeholder="lunch"
                />
                <EditField
                  label="Payee"
                  value={payee}
                  onChange={setPayee}
                  placeholder="who or where it went to"
                />
                <EditField
                  label="Category"
                  value={category}
                  onChange={setCategory}
                  placeholder="leave empty rather than guess"
                />
                <EditField
                  label="Payment method"
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  placeholder={defaultPayment}
                />
                <EditField
                  label="Date"
                  value={date}
                  onChange={setDate}
                  type="date"
                  max={todayISO()}
                />
                <EditField
                  label="Time of spending"
                  value={time}
                  onChange={setTime}
                  type="time"
                />
              </div>

              {error ? (
                <p className="mt-4 rounded-[var(--radius-input)] border-2 border-alert bg-paper-raised px-4 py-3 font-figtree text-body-sm text-alert">
                  {error}
                </p>
              ) : null}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={save}
                  className="focus-ring flex-1 rounded-[var(--radius-button)] border-2 border-vast-ink bg-mint-whisper px-5 py-3 font-figtree text-body-sm font-medium text-vast-ink active:bg-mint-deep"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setError(null);
                  }}
                  className="focus-ring rounded-[var(--radius-button)] border-2 border-vast-ink bg-paper px-5 py-3 font-figtree text-body-sm text-vast-ink active:bg-paper-edge"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>

        {/* §26: deletion is destructive and gets one deliberate confirmation. */}
        {!confirmingDelete ? (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="focus-ring self-start font-figtree text-body-sm text-fog underline underline-offset-4"
          >
            Delete this transaction
          </button>
        ) : (
          <div className="rounded-[var(--radius-card)] border-2 border-alert bg-paper-raised px-6 py-5">
            <p className="font-figtree text-body font-medium text-alert">
              Delete this transaction?
            </p>
            <p className="mt-1 font-figtree text-body-sm text-vast-ink">
              This permanently removes it from your journal.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="focus-ring rounded-[var(--radius-button)] border-2 border-vast-ink bg-paper px-5 py-3 font-figtree text-body-sm text-vast-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onDelete(t.id)}
                className="focus-ring rounded-[var(--radius-button)] border-2 border-alert bg-alert px-5 py-3 font-figtree text-body-sm font-medium text-paper"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

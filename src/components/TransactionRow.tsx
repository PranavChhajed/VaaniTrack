"use client";

import { DEFAULTS, type Transaction } from "@/lib/types";
import { timeDisplay } from "@/lib/journal";

/**
 * One transaction, optimised for scanning (§14, §15).
 *
 * Two things are primary: what it cost, and what it was for. A journal that
 * only answers the first is a list of numbers; the reason is what makes it a
 * memory. So the amount carries the visual weight and the description sits
 * beside it at full legibility, with payee, category and payment method
 * demoted beneath.
 *
 * Nothing is invented to fill a gap. A row missing a category simply has no
 * category on it (§15).
 */
export function TransactionRow({
  transaction,
  onOpen,
}: {
  transaction: Transaction;
  onOpen: (transaction: Transaction) => void;
}) {
  const t = transaction;
  const time = timeDisplay(t);

  // §17: a payee is not a description, but it is the best answer to "what was
  // this?" when no description was captured. "₹500 Rahul" must not render as a
  // blank row with a number on it.
  const description = t.description.value;
  const payee = t.payee.value;
  const primary = description ?? payee ?? "—";
  const showPayeeBelow = Boolean(payee && description);

  const meta = [
    showPayeeBelow ? payee : null,
    t.category.value,
    t.paymentMethod.value,
  ].filter(Boolean) as string[];

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(t)}
        className="focus-ring-dark group flex w-full items-start justify-between gap-4 border-b border-charcoal py-5 text-left last:border-b-0"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-figtree text-body text-paper">
            {primary}
          </span>

          {meta.length > 0 ? (
            <span className="mt-1 block truncate font-figtree text-caption text-haze">
              {meta.join(" · ")}
            </span>
          ) : null}

          {/* The logging stamp. Deliberately the quietest thing on the row:
              it says when this was written down, never when it was spent.
              Quieter than the meta line above by tone alone (paper-edge vs
              haze), not by opacity: an opacity multiplier on haze pushed a
              real timestamp below 4.5:1 against vast-ink. */}
          {time.kind !== "none" ? (
            <span
              className={[
                "mt-1 block font-figtree text-caption",
                time.kind === "transaction" ? "text-paper-edge" : "text-haze",
              ].join(" ")}
            >
              {time.text}
            </span>
          ) : null}
        </span>

        <span className="money shrink-0 text-subheading text-paper">
          {DEFAULTS.currency}
          {(t.amount.value ?? 0).toLocaleString("en-IN")}
        </span>
      </button>
    </li>
  );
}

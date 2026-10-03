"use client";

import Link from "next/link";
import { DEFAULTS, type Transaction } from "@/lib/types";

/**
 * Today's spending, rendered as one of the reference's "dark chambers": a
 * near-black inset room with an oversized corner radius, bookended by paper
 * canvas. The alternation is what gives the page its rhythm; a second light
 * panel here would flatten it.
 *
 * This shows one day, so it is a flat list rather than a grouped one. Amounts
 * sit in a right-aligned column using tabular figures, so ₹1,250 stacks
 * directly over ₹250 the way it would in an account book.
 */
export function TransactionList({
  transactions,
  onDelete,
}: {
  transactions: Transaction[];
  onDelete: (id: string) => void;
}) {
  const total = transactions.reduce((sum, t) => sum + (t.amount.value ?? 0), 0);

  return (
    <section className="rounded-[40px] bg-vast-ink px-6 py-10 sm:rounded-[80px] sm:px-12 sm:py-14">
      <div className="mb-10 flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="display-type text-heading-sm text-paper sm:text-heading">
          Today
        </h2>
        {transactions.length > 0 ? (
          <p className="font-figtree text-body-sm text-paper">
            <span className="money text-subheading">
              {DEFAULTS.currency}
              {total.toLocaleString("en-IN")}
            </span>
            <span className="ml-2 text-haze">
              across {transactions.length}{" "}
              {transactions.length === 1 ? "entry" : "entries"}
            </span>
          </p>
        ) : null}
      </div>

      {transactions.length === 0 ? (
        <p className="max-w-[52ch] font-figtree text-body text-haze">
          Nothing today yet. Say something like{" "}
          <span className="text-paper">&ldquo;two fifty, lunch&rdquo;</span> and
          it will show up here once you&rsquo;ve checked it.
        </p>
      ) : (
        <ul className="flex flex-col">
          {transactions.map((t) => (
            <li
              key={t.id}
              className="group flex items-baseline justify-between gap-4 border-b border-charcoal py-5 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate font-figtree text-body text-paper">
                  {t.description.value ?? "—"}
                  {t.payee.value ? (
                    <span className="text-haze"> to {t.payee.value}</span>
                  ) : null}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 font-figtree text-caption text-haze">
                  {t.category.value ? (
                    <span className="rounded-[9999px] bg-forest-ink px-3 py-1 font-medium text-paper">
                      {t.category.value}
                    </span>
                  ) : null}
                  {t.paymentMethod.value ? (
                    <span>{t.paymentMethod.value}</span>
                  ) : null}
                </p>
              </div>
              <div className="flex shrink-0 items-baseline gap-4">
                <span className="money text-subheading text-paper">
                  {DEFAULTS.currency}
                  {(t.amount.value ?? 0).toLocaleString("en-IN")}
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(t.id)}
                  aria-label={`Delete ${t.description.value ?? "transaction"}`}
                  className="font-figtree text-caption text-haze underline underline-offset-4 transition-opacity hover:text-paper focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Earlier days are no longer shown here, so say where they went;
          otherwise a corrected date looks like a deleted transaction. */}
      <Link
        href="/journal"
        className="mt-8 inline-block font-figtree text-body-sm text-haze underline underline-offset-4 hover:text-paper"
      >
        See earlier days in the journal
      </Link>
    </section>
  );
}

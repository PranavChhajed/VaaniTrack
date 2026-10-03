"use client";

import Link from "next/link";
import { TransactionRow } from "@/components/TransactionRow";
import { DEFAULTS, type Transaction } from "@/lib/types";

/**
 * Today's spending, rendered as one of the reference's "dark chambers": a
 * near-black inset room with an oversized corner radius, bookended by paper
 * canvas. The alternation is what gives the page its rhythm; a second light
 * panel here would flatten it.
 *
 * Rows are the same `TransactionRow` the journal uses — both chambers are
 * the same dark surface, so there was never a need for a second row
 * component. A tap opens the detail view, same as the journal; this screen
 * previously had its own hand-rolled row with a Delete button that fired
 * with no confirmation, while the journal's rows could be opened but not
 * deleted. Routing both through TransactionDetail makes the destructive
 * action the same two-stage confirm everywhere, and gives this screen an
 * edit path it never had.
 */
export function TransactionList({
  transactions,
  onOpen,
}: {
  transactions: Transaction[];
  onOpen: (transaction: Transaction) => void;
}) {
  const total = transactions.reduce((sum, t) => sum + (t.amount.value ?? 0), 0);

  return (
    <section className="rounded-[var(--radius-chamber)] bg-vast-ink px-6 py-10 sm:rounded-[var(--radius-chamber-lg)] sm:px-12 sm:py-14">
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
            <TransactionRow key={t.id} transaction={t} onOpen={onOpen} />
          ))}
        </ul>
      )}

      {/* Earlier days are no longer shown here, so say where they went;
          otherwise a corrected date looks like a deleted transaction. */}
      <Link
        href="/journal"
        className="focus-ring mt-8 inline-block font-figtree text-body-sm text-haze underline underline-offset-4 hover:text-paper"
      >
        See earlier days in the journal
      </Link>
    </section>
  );
}

"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { ExpenseIcon } from "@/components/ExpenseIcon";
import { todayISO, fromISO } from "@/lib/journal";
import {
  PART_HOURS,
  breakdown,
  facts,
  lastNDays,
  pickFact,
  weekSummary,
  whenSummary,
  type WhenSummary,
} from "@/lib/insights";
import { useTransactions } from "@/lib/useTransactions";
import type { Transaction } from "@/lib/types";

/**
 * Insights: the journal, stepped back from.
 *
 * Four small cards and no controls beyond one tap on the fun fact. It reads the
 * same journal the other screens write and keeps nothing of its own; the
 * numbers come from `lib/insights`, which is where the rules about what may be
 * compared and what counts as enough live.
 *
 * The tone is deliberate: words, not red and green. A week that cost more is
 * "₹420 more than the week before", in the same ink as one that cost less.
 */

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function Card({
  title,
  note,
  children,
  tone = "paper",
}: {
  title?: string;
  note?: string;
  children: ReactNode;
  tone?: "paper" | "mint";
}) {
  return (
    <section
      className={[
        "rounded-[var(--radius-card)] border-2 border-vast-ink p-6",
        tone === "mint" ? "bg-mint-whisper" : "bg-paper-raised",
      ].join(" ")}
    >
      {title ? (
        <h2 className="display-type text-subheading text-vast-ink">{title}</h2>
      ) : null}
      {note ? (
        <p className="mt-1 font-figtree text-caption text-fog">{note}</p>
      ) : null}
      <div className={title ? "mt-5" : ""}>{children}</div>
    </section>
  );
}

/* ---------------------------------------------------------------- *
 * This week
 * ---------------------------------------------------------------- */

function WeekCard({
  transactions,
  today,
}: {
  transactions: Transaction[];
  today: string;
}) {
  const week = useMemo(() => weekSummary(transactions, today), [transactions, today]);
  const tallest = Math.max(...week.days.map((d) => d.total), 1);

  const line =
    week.compare.kind === "delta"
      ? week.compare.diff === 0
        ? "The same as the week before."
        : `${rupees(Math.abs(week.compare.diff))} ${
            week.compare.diff < 0 ? "less" : "more"
          } than the week before.`
      : week.loggedDays === 0
        ? "Nothing noted in the last 7 days."
        : "Keep noting, and this will compare with last week.";

  return (
    <Card>
      <p className="font-figtree text-body-sm text-fog">Last 7 days</p>
      <p className="money display-type mt-1 text-heading-lg text-vast-ink">
        {rupees(week.total)}
      </p>
      <p className="mt-2 font-figtree text-body-sm text-vast-ink">{line}</p>
      <p className="mt-1 font-figtree text-caption text-fog">
        Noted on {week.loggedDays} of 7 days
        {week.withoutAmount > 0
          ? ` · ${week.withoutAmount} without an amount`
          : ""}
      </p>

      <ol
        className="mt-6 flex items-end gap-2"
        aria-label="Spending each day, oldest first"
      >
        {week.days.map((d, i) => {
          const isToday = i === week.days.length - 1;
          const height = d.count === 0 ? 4 : Math.max(8, (d.total / tallest) * 96);
          const name = fromISO(d.date).toLocaleDateString("en-IN", { weekday: "short" });
          return (
            <li key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end">
                <div
                  className={[
                    "w-full rounded-t-[8px] border-2 border-vast-ink",
                    d.count === 0
                      ? "border-dashed border-haze bg-transparent"
                      : isToday
                        ? "bg-vast-ink"
                        : "bg-mint-deep",
                  ].join(" ")}
                  style={{ height }}
                />
              </div>
              <span className="font-figtree text-caption text-fog">{name}</span>
              <span className="sr-only">
                {d.count === 0
                  ? `${name}: nothing noted`
                  : `${name}: ${rupees(d.total)}${isToday ? ", today so far" : ""}`}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 font-figtree text-caption text-fog">
        Today’s bar is still filling.
      </p>
    </Card>
  );
}

/* ---------------------------------------------------------------- *
 * Fun fact
 * ---------------------------------------------------------------- */

function FactCard({
  transactions,
  today,
}: {
  transactions: Transaction[];
  today: string;
}) {
  const [shift, setShift] = useState(0);
  const list = useMemo(() => facts(transactions, today), [transactions, today]);
  const fact = pickFact(list, today, shift);
  if (!fact) return null;

  const several = list.length > 1;
  const Tag = several ? "button" : "div";

  return (
    <Tag
      {...(several
        ? { type: "button" as const, onClick: () => setShift((s) => s + 1) }
        : {})}
      className="focus-ring block w-full rounded-[var(--radius-card)] border-2 border-vast-ink bg-mint-whisper p-6 text-left active:bg-mint-deep"
    >
      <span className="block font-figtree text-caption text-forest-ink">
        Did you know
      </span>
      <span
        aria-live="polite"
        className="display-type mt-2 block text-subheading text-vast-ink"
      >
        {fact.text}
      </span>
      {several ? (
        <span className="mt-3 block font-figtree text-caption text-forest-ink">
          Tap for another
        </span>
      ) : null}
    </Tag>
  );
}

/* ---------------------------------------------------------------- *
 * Where it went
 * ---------------------------------------------------------------- */

/** Enough entries that a split says something. */
const MIN_FOR_SPLIT = 7;

function WhereCard({
  transactions,
  today,
}: {
  transactions: Transaction[];
  today: string;
}) {
  const days = useMemo(() => lastNDays(today, 7), [today]);
  const slices = useMemo(
    () => breakdown(transactions, days[0], today),
    [transactions, days, today],
  );
  const count = slices.reduce((s, x) => s + x.count, 0);

  if (count < MIN_FOR_SPLIT) {
    return (
      <Card title="Where it went">
        <p className="font-figtree text-body-sm text-fog">
          Keep logging. A split shows up after a few more entries.
        </p>
      </Card>
    );
  }

  const other = slices.find((s) => s.kind === "receipt");
  const biggest = slices.reduce((a, b) => (b.total > a.total ? b : a));

  return (
    <Card title="Where it went" note="Last 7 days, grouped from your descriptions">
      <ul className="flex flex-col gap-4">
        {slices.map((s) => (
          <li key={s.kind} className="flex items-center gap-3">
            <ExpenseIcon kind={s.kind} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-figtree text-body-sm font-medium text-vast-ink">
                  {s.label}
                  <span className="font-normal text-fog">
                    {" "}
                    · {s.count} {s.count === 1 ? "entry" : "entries"}
                  </span>
                </span>
                <span className="money font-figtree text-body-sm text-vast-ink">
                  {rupees(s.total)}
                </span>
              </div>
              <div
                className="mt-2 h-3 w-full rounded-full border-2 border-vast-ink bg-paper"
                role="img"
                aria-label={`${Math.round(s.share * 100)} percent`}
              >
                <div
                  className="h-full rounded-full bg-mint-deep"
                  style={{ width: `${Math.max(s.share * 100, 4)}%` }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
      {other && other.kind === biggest.kind ? (
        <p className="mt-5 font-figtree text-caption text-fog">
          Most of it isn’t named yet, so the groups above are only part of the
          picture.
        </p>
      ) : null}
    </Card>
  );
}

/* ---------------------------------------------------------------- *
 * When you log
 * ---------------------------------------------------------------- */

function WhenCard({ when }: { when: WhenSummary }) {
  const most = Math.max(...when.parts.map((p) => p.count), 1);
  const spoken = when.basis === "spoken";

  return (
    <Card
      title={spoken ? "When you spend" : "When you log"}
      note={
        spoken
          ? `From the times you said, across ${when.n} entries`
          : `When you note things down, across ${when.n} entries`
      }
    >
      <ul className="flex flex-col gap-4">
        {when.parts.map((p) => (
          <li key={p.part} className="flex items-center gap-3">
            <div className="w-[88px] shrink-0">
              <p className="font-figtree text-body-sm font-medium text-vast-ink">
                {p.label}
              </p>
              <p className="font-figtree text-caption text-fog">
                {PART_HOURS[p.part]}
              </p>
            </div>
            <div
              className="h-5 flex-1 rounded-full border-2 border-vast-ink bg-paper"
              role="img"
              aria-label={`${p.count} entries`}
            >
              <div
                className={[
                  "h-full rounded-full",
                  p.part === when.top ? "bg-vast-ink" : "bg-mint-deep",
                ].join(" ")}
                style={{ width: `${p.count === 0 ? 0 : Math.max((p.count / most) * 100, 6)}%` }}
              />
            </div>
            <span className="money w-8 shrink-0 text-right font-figtree text-body-sm text-vast-ink">
              {p.count}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- *
 * Screen
 * ---------------------------------------------------------------- */

function Cards({ transactions }: { transactions: Transaction[] }) {
  // Read once, after the journal has loaded: the server has no "today" that
  // matches the phone's, and reading it during the first render would not
  // agree with what the server sent.
  const [today] = useState(() => todayISO());
  const when = useMemo(() => whenSummary(transactions), [transactions]);

  if (transactions.length < 3) {
    return (
      <Card>
        <p className="display-type text-subheading text-vast-ink">
          A few more expenses and this fills in.
        </p>
        <p className="mt-2 font-figtree text-body-sm text-fog">
          Your week, where it went, and a fun fact or two, all worked out on
          this phone from what you record.
        </p>
        <Link
          href="/app"
          className="focus-ring mt-5 inline-block rounded-[var(--radius-pill)] border-2 border-vast-ink bg-mint-whisper px-6 py-3 font-figtree text-body-sm font-medium text-vast-ink active:bg-mint-deep"
        >
          Record an expense
        </Link>
      </Card>
    );
  }

  return (
    <>
      <WeekCard transactions={transactions} today={today} />
      <FactCard transactions={transactions} today={today} />
      <WhereCard transactions={transactions} today={today} />
      {when ? <WhenCard when={when} /> : null}
      <p className="px-2 text-center font-figtree text-caption text-fog">
        Worked out on this phone. Nothing here leaves it.
      </p>
    </>
  );
}

export default function InsightsPage() {
  const { transactions, hydrated } = useTransactions();

  return (
    <main className="mx-auto flex w-full max-w-[900px] flex-col gap-6 px-5 pb-36 pt-8 sm:px-8 sm:pt-12">
      <AppHeader profile />
      <div>
        <h1 className="display-type text-heading text-vast-ink">Insights</h1>
      </div>
      {!hydrated ? (
        <p className="font-figtree text-body text-fog">Reading your journal…</p>
      ) : (
        <Cards transactions={transactions} />
      )}
    </main>
  );
}

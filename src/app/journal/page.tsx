"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DatePicker } from "@/components/DatePicker";
import { DayCapture } from "@/components/DayCapture";
import { TransactionDetail } from "@/components/TransactionDetail";
import { TransactionRow } from "@/components/TransactionRow";
import {
  dayLabel,
  deleteTransaction,
  forDate,
  groupByDay,
  groupByMonth,
  monthLabel,
  monthTotal,
  populatedDates,
  todayISO,
  updateTransaction,
  type DayGroup,
  type MonthGroup,
} from "@/lib/journal";
import { useCapture } from "@/lib/useCapture";
import {
  changedFields,
  reportDelete,
  reportEvent,
  reportTransactions,
} from "@/lib/report";
import {
  DEFAULTS,
  loadTransactions,
  saveTransactions,
  type Transaction,
} from "@/lib/types";

/**
 * The journal — Phase A.
 *
 * Two states of one screen, which is how §8 and §18 reconcile:
 *
 *   browse  — every populated day, newest first. The default.
 *   day     — one chosen date, and only that date. Entered from the picker.
 *
 * Day-by-day scrolling is deliberately not built (§18). The requirement is
 * that history is reachable, not that it is an infinite feed, and committing
 * to a feed now would make the day view harder to add later rather than
 * easier.
 */

/**
 * How loudly to offer capture, by how full the day already is (§20).
 *
 * An empty journal should ask for something to record. A full day should get
 * out of the way. The threshold is a design intuition rather than a measured
 * number, so it lives here as a named constant instead of being scattered
 * through the markup.
 */
const BUSY_DAY = 5;

function captureProminence(count: number): "primary" | "offered" | "quiet" {
  if (count === 0) return "primary";
  if (count < BUSY_DAY) return "offered";
  return "quiet";
}

/**
 * Browse-view capture, which has no day to record onto.
 *
 * Looking at every day at once is not being on a particular day, so this sends
 * you to the capture screen and lands on today. Picking a date gets you the
 * recorder in place instead.
 */
function CaptureAction({ count }: { count: number }) {
  const level = captureProminence(count);

  if (level === "quiet") {
    return (
      <Link
        href="/"
        className="mt-6 inline-block font-figtree text-body-sm text-fog underline underline-offset-4 hover:text-paper"
      >
        Record an expense
      </Link>
    );
  }

  return (
    <Link
      href="/"
      className={[
        "mt-6 inline-block rounded-[var(--radius-pill)] border-2 border-vast-ink",
        "font-figtree font-medium text-vast-ink active:bg-mint-deep",
        level === "primary"
          ? "bg-mint-whisper px-8 py-4 text-body"
          : "bg-mint-whisper px-6 py-3 text-body-sm",
      ].join(" ")}
    >
      Record an expense
    </Link>
  );
}

/**
 * The quiet way to add to a day.
 *
 * Deliberately small, and deliberately not a recorder. The journal is for
 * reading a day back; adding to it is available rather than offered, so the
 * recording surface stays behind this tap instead of sitting open beside the
 * day's transactions and competing with them.
 */
function LogOntoDay({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-8 rounded-[var(--radius-pill)] border-2 border-charcoal px-5 py-2.5 font-figtree text-body-sm text-paper transition-colors active:bg-charcoal"
    >
      + Log an expense
    </button>
  );
}

/**
 * The rule that marks a change of month in the scroll.
 *
 * Heavier than a day rule — bright against the chamber where a day gets a
 * muted line — because it is the larger division. The scroll itself stays
 * continuous; this is a marker in it, not a boundary that hides anything.
 */
function MonthSection({
  group,
  onOpen,
}: {
  group: MonthGroup;
  onOpen: (t: Transaction) => void;
}) {
  return (
    <div className="mb-12 last:mb-0">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-paper pb-2">
        <span className="font-figtree text-caption font-semibold uppercase tracking-[0.08em] text-paper">
          {group.label}
        </span>
        <span className="font-figtree text-caption text-fog">
          <span className="money text-body-sm text-paper">
            {DEFAULTS.currency}
            {group.total.toLocaleString("en-IN")}
          </span>
        </span>
      </div>

      {group.days.map((day) => (
        <DaySection key={day.date ?? "undated"} group={day} onOpen={onOpen} />
      ))}
    </div>
  );
}

function DaySection({
  group,
  onOpen,
}: {
  group: DayGroup;
  onOpen: (t: Transaction) => void;
}) {
  return (
    <div className="mb-10 last:mb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-charcoal pb-3">
        <span className="display-type text-subheading text-paper">
          {dayLabel(group.date)}
        </span>
        <span className="font-figtree text-caption text-fog">
          <span className="money text-body-sm text-paper">
            {DEFAULTS.currency}
            {group.total.toLocaleString("en-IN")}
          </span>
          <span className="ml-2">
            {group.count} {group.count === 1 ? "transaction" : "transactions"}
          </span>
        </span>
      </div>

      {group.timed.length > 0 ? (
        <ul className="flex flex-col">
          {group.timed.map((t) => (
            <TransactionRow key={t.id} transaction={t} onOpen={onOpen} />
          ))}
        </ul>
      ) : null}

      {group.untimed.length > 0 ? (
        <>
          {/* Kept visibly apart from the timed rows above. Sliding these into
              the same list would place them somewhere in the day's chronology,
              and their position would read as a claim about when they
              happened — which is exactly what is not known (§13). */}
          {group.timed.length > 0 ? (
            <p className="pt-5 font-figtree text-caption uppercase tracking-[0.08em] text-fog">
              Time not recorded
            </p>
          ) : null}
          <ul className="flex flex-col">
            {group.untimed.map((t) => (
              <TransactionRow key={t.id} transaction={t} onOpen={onOpen} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export default function Journal() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [open, setOpen] = useState<Transaction | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    setTransactions(loadTransactions());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveTransactions(transactions);
  }, [transactions, hydrated]);

  const handleLogged = useCallback((saved: Transaction[]) => {
    setTransactions((prev) => [...saved, ...prev]);
  }, []);

  const handleUndo = useCallback((ids: string[]) => {
    const drop = new Set(ids);
    setTransactions((prev) => prev.filter((t) => !drop.has(t.id)));
  }, []);

  // The day being viewed is the day a capture lands on. Null while browsing,
  // which falls back to today — the same behaviour as the capture screen.
  const capture = useCapture({
    captureDate: selected,
    onLogged: handleLogged,
    onUndo: handleUndo,
  });

  const groups = useMemo(() => groupByDay(transactions), [transactions]);
  const populated = useMemo(() => populatedDates(transactions), [transactions]);
  const day = useMemo(
    () => (selected ? forDate(transactions, selected) : null),
    [transactions, selected],
  );

  // Keep the open transaction in step with edits, so the detail view never
  // shows a stale copy of a record it just changed.
  const openLive = open ? transactions.find((t) => t.id === open.id) ?? null : null;

  const months = useMemo(() => groupByMonth(groups), [groups]);

  // The headline figure is this calendar month, not everything ever recorded.
  // A running all-time total grows without meaning; a month is the cycle rent
  // and salary actually land on.
  const thisMonth = todayISO();
  const currentMonthTotal = useMemo(
    () => monthTotal(transactions, thisMonth),
    [transactions, thisMonth],
  );
  const viewing = selected ? dayLabel(selected) : monthLabel(thisMonth);

  return (
    <main className="mx-auto flex w-full max-w-[900px] flex-col gap-8 px-5 py-8 sm:px-8 sm:py-12">
      <header className="flex items-center justify-between rounded-[var(--radius-pill)] border-2 border-vast-ink bg-paper-raised px-6 py-4">
        <span className="font-figtree text-body-sm font-semibold tracking-tight">
          VaaniTrack
        </span>
        {/* Capture is the app; this is a room you stepped into. The way back
            is stated plainly rather than left to the browser's back button. */}
        <Link
          href="/"
          className="font-figtree text-body-sm text-charcoal underline underline-offset-4 hover:text-vast-ink"
        >
          &lsaquo; Capture
        </Link>
      </header>

      <div>
        <h1 className="display-type text-heading text-vast-ink">Expenses</h1>
        <p className="mt-2 font-figtree text-body-sm text-fog">
          {viewing}
          {!selected && transactions.length > 0 ? (
            <>
              {" · "}
              <span className="money text-vast-ink">
                {DEFAULTS.currency}
                {currentMonthTotal.toLocaleString("en-IN")}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className="rounded-[var(--radius-pill)] border-2 border-vast-ink bg-paper-raised px-5 py-3 font-figtree text-body-sm text-vast-ink active:bg-mint-whisper"
        >
          {pickerOpen ? "Close dates" : "Pick a date"}
        </button>

        {/* Only offered once you have gone somewhere else — otherwise it is a
            button that does nothing (§18). */}
        {selected ? (
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setPickerOpen(false);
              setSheetOpen(false);
            }}
            className="rounded-[var(--radius-pill)] border-2 border-vast-ink bg-mint-whisper px-5 py-3 font-figtree text-body-sm font-medium text-vast-ink active:bg-mint-deep"
          >
            All days
          </button>
        ) : null}
      </div>

      {pickerOpen ? (
        <DatePicker
          selected={selected}
          populated={populated}
          onSelect={(iso) => {
            setSelected(iso);
            setPickerOpen(false);
            setSheetOpen(false);
          }}
        />
      ) : null}

      <section className="rounded-[var(--radius-chamber)] bg-vast-ink px-6 py-10 sm:rounded-[var(--radius-chamber-lg)] sm:px-12 sm:py-14">
        {!hydrated ? (
          <p className="font-figtree text-body text-fog">Opening your journal…</p>
        ) : selected ? (
          /* One chosen date, and only that date. */
          day && day.count > 0 ? (
            <>
              <DaySection group={day} onOpen={setOpen} />
              <LogOntoDay onOpen={() => setSheetOpen(true)} />
            </>
          ) : (
            <div>
              <h2 className="display-type text-heading-sm text-paper">
                {dayLabel(selected)}
              </h2>
              <p className="mt-3 max-w-[46ch] font-figtree text-body text-fog">
                No transactions recorded.
              </p>
              <LogOntoDay onOpen={() => setSheetOpen(true)} />
            </div>
          )
        ) : groups.length === 0 ? (
          /* §21 — nothing anywhere. Speaks about recording, not "tracking". */
          <div>
            <h2 className="display-type text-heading-sm text-paper">
              Your journal is empty
            </h2>
            <p className="mt-3 max-w-[46ch] font-figtree text-body text-fog">
              Expenses you record will appear here, organised by day.
            </p>
            <CaptureAction count={0} />
          </div>
        ) : (
          <>
            {months.map((month) => (
              <MonthSection
                key={month.month ?? "undated"}
                group={month}
                onOpen={setOpen}
              />
            ))}
            <CaptureAction count={groups[0]?.count ?? 0} />
          </>
        )}
      </section>

      {/* Recording happens on the day you are looking at, so it only exists
          once a day has been chosen — and only once asked for. */}
      {selected && sheetOpen ? (
        <DayCapture
          capture={capture}
          dateLabel={dayLabel(selected)}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}

      {openLive ? (
        <TransactionDetail
          transaction={openLive}
          onClose={() => setOpen(null)}
          onSave={(next) => {
            // Reported before the edit lands: `openLive` still holds what the
            // model produced, and after this line nothing does. A correction is
            // only evidence if you can see what it corrected.
            reportEvent("edited", {
              transactionId: next.id,
              before: openLive,
              after: next,
              changedFields: changedFields(openLive, next),
            });
            reportTransactions([next]);
            setTransactions((prev) => updateTransaction(prev, next.id, next));
            setOpen(null);
          }}
          onDelete={(id) => {
            reportEvent("deleted", { transactionId: id, before: openLive });
            reportDelete(id);
            setTransactions((prev) => deleteTransaction(prev, id));
            setOpen(null);
          }}
        />
      ) : null}
    </main>
  );
}

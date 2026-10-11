"use client";

import {
  compactAmount,
  fromISO,
  isFuture,
  monthGrid,
  monthLabel,
  shiftMonth,
} from "@/lib/journal";
import { DEFAULTS } from "@/lib/types";
import { useToday } from "@/lib/useToday";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * The month, with what each day cost written under its date.
 *
 * This began as date navigation only (§18): a dot for "something is here" and
 * deliberately no amounts. A month of real use overturned that. The question
 * the journal actually gets asked is "what did I spend on the 14th", and a dot
 * answers it only after a tap. So each populated day carries its total, and
 * the header carries the month's.
 *
 * Still not a heatmap and still no category colour: the figures are the whole
 * of it.
 *
 * Future dates are disabled. Expenses happen in the past, capture always dates
 * to today, and editing refuses a future date (§29), so a future day could
 * never hold anything, and offering it would only lead somewhere empty.
 *
 * `month` is owned by the caller, so the journal can keep the calendar and
 * the list beneath it pointed at the same place.
 */
export function DatePicker({
  selected,
  totals,
  month,
  onMonthChange,
  onSelect,
}: {
  selected: string | null;
  /** What each populated date cost; see `dayTotals`. */
  totals: Map<string, number>;
  month: string;
  onMonthChange: (iso: string) => void;
  onSelect: (iso: string) => void;
}) {
  const today = useToday();
  const weeks = monthGrid(month);
  const monthSpend = weeks
    .flat()
    .reduce((sum, iso) => sum + ((iso && totals.get(iso)) || 0), 0);

  return (
    <div className="rounded-[var(--radius-card)] border-2 border-vast-ink bg-paper-raised p-3 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(month, -1))}
          aria-label="Previous month"
          className="focus-ring flex h-11 w-11 items-center justify-center rounded-[var(--radius-button)] border-2 border-vast-ink bg-paper font-figtree text-body-sm active:bg-mint-whisper"
        >
          &lsaquo;
        </button>

        <span className="flex flex-col items-center">
          <span className="display-type text-subheading text-vast-ink">
            {monthLabel(month)}
          </span>
          <span className="money font-figtree text-caption text-fog">
            {DEFAULTS.currency}
            {monthSpend.toLocaleString("en-IN")}
          </span>
        </span>

        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(month, 1))}
          aria-label="Next month"
          className="focus-ring flex h-11 w-11 items-center justify-center rounded-[var(--radius-button)] border-2 border-vast-ink bg-paper font-figtree text-body-sm active:bg-mint-whisper"
        >
          &rsaquo;
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day, i) => (
          <span
            key={`${day}-${i}`}
            className="pb-2 text-center font-figtree text-caption font-semibold text-fog"
          >
            {day}
          </span>
        ))}

        {weeks.flat().map((iso, i) => {
          if (!iso) return <span key={`pad-${i}`} />;

          const disabled = isFuture(iso);
          const isSelected = iso === selected;
          const isToday = iso === today;
          const spent = totals.get(iso);

          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(iso)}
              // Begins with what is printed on the cell ("9 ₹1.1k"), so that
              // saying what you see selects it, and then says it in full.
              aria-label={`${fromISO(iso).getDate()}${
                spent === undefined ? "" : ` ${DEFAULTS.currency}${compactAmount(spent)}`
              }, ${monthLabel(month)}${
                spent === undefined
                  ? ""
                  : `, ${DEFAULTS.currency}${spent.toLocaleString("en-IN")} spent`
              }`}
              aria-current={isToday ? "date" : undefined}
              className={[
                "focus-ring flex h-[52px] flex-col items-center justify-start gap-1 rounded-[var(--radius-button)] pt-2",
                "font-figtree text-body-sm transition-colors",
                disabled
                  ? "cursor-not-allowed text-paper-edge"
                  : isSelected
                    ? "border-2 border-vast-ink bg-forest-ink font-semibold text-paper"
                    : isToday
                      ? "border-2 border-vast-ink bg-paper text-vast-ink"
                      : "text-vast-ink active:bg-mint-whisper",
              ].join(" ")}
            >
              <span className="leading-none">{fromISO(iso).getDate()}</span>
              {/* The day's total. Absent, not zero, on a day with nothing
                  recorded: a blank cell and a "0" say different things. */}
              {spent !== undefined ? (
                <span
                  className={[
                    "money text-[11px] font-medium leading-none",
                    isSelected ? "text-paper" : "text-forest-ink",
                  ].join(" ")}
                >
                  {DEFAULTS.currency}
                  {compactAmount(spent)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

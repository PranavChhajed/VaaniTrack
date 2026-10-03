"use client";

import { useState } from "react";
import {
  fromISO,
  isFuture,
  monthGrid,
  monthLabel,
  shiftMonth,
  todayISO,
} from "@/lib/journal";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Date navigation only (§18).
 *
 * Not a spending visualisation: no heatmap, no amounts, no category colour.
 * The single piece of information it carries beyond the dates themselves is a
 * mark showing which days have anything on them, because otherwise choosing a
 * date is guesswork.
 *
 * Future dates are disabled. Expenses happen in the past, capture always dates
 * to today, and editing refuses a future date (§29), so a future day could
 * never hold anything, and offering it would only lead somewhere empty.
 */
export function DatePicker({
  selected,
  populated,
  onSelect,
}: {
  selected: string | null;
  populated: Set<string>;
  onSelect: (iso: string) => void;
}) {
  const [month, setMonth] = useState(() => selected ?? todayISO());
  const today = todayISO();

  return (
    <div className="rounded-[var(--radius-card)] border-2 border-vast-ink bg-paper-raised p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          aria-label="Previous month"
          className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-button)] border-2 border-vast-ink bg-paper font-figtree text-body-sm active:bg-mint-whisper"
        >
          &lsaquo;
        </button>

        <span className="display-type text-subheading text-vast-ink">
          {monthLabel(month)}
        </span>

        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          aria-label="Next month"
          className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-button)] border-2 border-vast-ink bg-paper font-figtree text-body-sm active:bg-mint-whisper"
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

        {monthGrid(month).flat().map((iso, i) => {
          if (!iso) return <span key={`pad-${i}`} />;

          const disabled = isFuture(iso);
          const isSelected = iso === selected;
          const isToday = iso === today;
          const hasRows = populated.has(iso);

          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(iso)}
              aria-label={`${fromISO(iso).getDate()} ${monthLabel(month)}${hasRows ? ", has transactions" : ""}`}
              aria-current={isToday ? "date" : undefined}
              className={[
                "relative flex aspect-square items-center justify-center rounded-[var(--radius-button)]",
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
              {fromISO(iso).getDate()}
              {/* A day with something on it. Presence only, never how much. */}
              {hasRows && !isSelected ? (
                <span className="absolute bottom-1 block h-[5px] w-[5px] rounded-full bg-forest-ink" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

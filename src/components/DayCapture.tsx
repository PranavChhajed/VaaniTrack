"use client";

import { useEffect } from "react";
import { CapturePanel } from "@/components/CapturePanel";
import type { Capture } from "@/lib/useCapture";

/**
 * Recording onto the day you are looking at, as a sheet.
 *
 * The journal exists to be read. An always-open recorder made every day into
 * a form with a list attached, which inverted that, so recording is behind a
 * deliberate tap, and arrives over the day rather than beside it.
 *
 * The date is stated on the sheet itself rather than left implied. This is the
 * one place in the app where where-you-are changes what-gets-written, and that
 * only stays acceptable while it is impossible to miss.
 */
export function DayCapture({
  capture,
  dateLabel,
  onClose,
}: {
  capture: Capture;
  dateLabel: string;
  onClose: () => void;
}) {
  // Escape closes, and the page behind stops scrolling while it is open;
  // otherwise dragging the sheet's content scrolls the journal underneath it.
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

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="focus-ring veil-in absolute inset-0 h-full w-full cursor-default bg-vast-ink/50"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Record an expense onto ${dateLabel}`}
        className="sheet-rise absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] w-full max-w-[560px] overflow-y-auto rounded-t-[var(--radius-chamber)] border-t-2 border-vast-ink bg-paper px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-3"
      >
        <div className="mx-auto mb-4 h-[5px] w-12 rounded-full bg-paper-edge" aria-hidden="true" />

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="display-type text-heading-sm text-vast-ink">
              Record onto {dateLabel}
            </h2>
            <p className="mt-2 max-w-[42ch] font-figtree text-body-sm text-charcoal">
              It will be filed under {dateLabel}, unless you name a
              different day out loud.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring shrink-0 rounded-[var(--radius-pill)] border-2 border-vast-ink bg-paper-raised px-4 py-2 font-figtree text-body-sm text-vast-ink active:bg-mint-whisper"
          >
            Done
          </button>
        </div>

        <div className="mt-6">
          <CapturePanel
            capture={capture}
            pendingHeadingTag="h3"
            typedLabel={`Type an expense for ${dateLabel}`}
            loggedPrefix={`Logged onto ${dateLabel}:`}
            pendingClassName="mt-6 flex flex-col gap-6"
          />
        </div>
      </div>
    </div>
  );
}

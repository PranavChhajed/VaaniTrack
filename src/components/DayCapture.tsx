"use client";

import { useEffect } from "react";
import { ReviewCard } from "@/components/ReviewCard";
import { WaveformButton } from "@/components/WaveformButton";
import type { Capture } from "@/lib/useCapture";

/**
 * Recording onto the day you are looking at, as a sheet.
 *
 * The journal exists to be read. An always-open recorder made every day into
 * a form with a list attached, which inverted that — so recording is behind a
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
  // Escape closes, and the page behind stops scrolling while it is open —
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
        className="veil-in absolute inset-0 h-full w-full cursor-default bg-vast-ink/50"
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
              It will be filed under {dateLabel} &mdash; unless you name a
              different day out loud.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-[var(--radius-pill)] border-2 border-vast-ink bg-paper-raised px-4 py-2 font-figtree text-body-sm text-vast-ink active:bg-mint-whisper"
          >
            Done
          </button>
        </div>

        <div className="mt-6 w-full">
          <WaveformButton
            state={capture.state}
            level={capture.level}
            busy={capture.busy}
            onStart={capture.start}
            onStop={capture.stop}
          />
        </div>

        <form
          className="mt-4 flex w-full max-w-[340px] items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void capture.submitTyped();
          }}
        >
          <input
            value={capture.typed}
            onChange={(e) => capture.setTyped(e.target.value)}
            placeholder="…or type it: 250 lunch"
            aria-label={`Type an expense for ${dateLabel}`}
            enterKeyHint="done"
            className="min-w-0 flex-1 rounded-[var(--radius-input)] border-2 border-vast-ink bg-paper-raised px-4 py-3 font-figtree text-body-sm text-vast-ink outline-none placeholder:text-fog focus:border-forest-ink"
          />
          <button
            type="submit"
            disabled={!capture.typed.trim() || capture.busy}
            className={[
              "shrink-0 rounded-[var(--radius-input)] border-2 border-vast-ink px-5 py-3",
              "font-figtree text-body-sm font-medium text-vast-ink",
              !capture.typed.trim() || capture.busy
                ? "cursor-not-allowed bg-paper-edge opacity-60"
                : "bg-mint-whisper active:bg-mint-deep",
            ].join(" ")}
          >
            Add
          </button>
        </form>

        {capture.error ? (
          <p className="mt-6 max-w-[60ch] rounded-[var(--radius-input)] border-2 border-vast-ink bg-ember-glow px-4 py-3 font-figtree text-body-sm text-vast-ink">
            {capture.error}
          </p>
        ) : null}

        {/* The day's list is behind the sheet, so a saved entry can't be seen
            landing on it. This line is the confirmation instead. */}
        {capture.justSaved && capture.justSaved.length > 0 ? (
          <div className="rise mt-6 flex w-full flex-wrap items-center justify-between gap-3 rounded-[var(--radius-input)] border-2 border-vast-ink bg-mint-whisper px-4 py-3">
            <span className="font-figtree text-body-sm text-vast-ink">
              Logged onto {dateLabel}:{" "}
              {capture.justSaved.map((t, i) => (
                <span key={t.id}>
                  {i > 0 ? " · " : ""}
                  <span className="money">₹{t.amount.value}</span>{" "}
                  {t.description.value ?? ""}
                </span>
              ))}
            </span>
            <button
              type="button"
              onClick={capture.undo}
              className="font-figtree text-body-sm font-medium text-vast-ink underline underline-offset-4"
            >
              Undo
            </button>
          </div>
        ) : null}

        {capture.debug ? (
          <p className="mt-3 break-words font-figtree text-caption text-fog">
            {capture.debug}
          </p>
        ) : null}

        {capture.pending.length > 0 ? (
          <div className="mt-6 flex flex-col gap-6">
            <h3 className="display-type text-subheading text-vast-ink">
              {capture.pending.length === 1
                ? "Check this before it’s saved"
                : `Check these ${capture.pending.length} before they’re saved`}
            </h3>
            {capture.pending.map((item, index) => (
              <ReviewCard
                key={item.transaction.id}
                transaction={item.transaction}
                needsConfirmation={item.needsConfirmation}
                confirmationReason={item.confirmationReason}
                onSave={(t) => capture.commit(index, t)}
                onDiscard={() => capture.discard(index)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

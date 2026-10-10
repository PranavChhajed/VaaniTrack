"use client";

import { useEffect, useRef } from "react";
import { ReviewCard } from "@/components/ReviewCard";
import { WaveformButton } from "@/components/WaveformButton";
import type { Transaction } from "@/lib/types";
import type { Capture } from "@/lib/useCapture";

/**
 * The record-and-review block: waveform button, typed-entry fallback, the
 * error banner, the auto-saved/Undo confirmation, the debug line, and the
 * pending review cards.
 *
 * Previously duplicated near-verbatim between `(app)/app/page.tsx` and
 * `DayCapture.tsx` — about 95 lines, differing only in a label prefix, the
 * heading's element, and whether a captured review card needs to be
 * scrolled into view.
 *
 * Returns a Fragment of two top-level elements (controls, then the pending
 * review block) rather than one wrapping element, because the two callers
 * space them differently: the capture screen renders this as a direct
 * child of a `<main>` that spaces ITS direct children with `gap-16`/
 * `gap-24`, so both pieces need to stay direct children of that `<main>`
 * for that spacing to keep applying between them. `DayCapture`'s dialog has
 * no such system and spaces everything with individual margins instead, so
 * it overrides `pendingClassName` to carry its own `mt-6`.
 */
export function CapturePanel({
  capture,
  pendingHeadingTag = "h2",
  typedLabel = "Type an expense",
  loggedPrefix = "Logged",
  scrollToPending = false,
  pendingClassName = "flex flex-col gap-6 scroll-mt-4",
  onEdit,
  notice = null,
}: {
  capture: Capture;
  /** A calm instruction shown under the controls, for a state that is not an
   *  error: the screen opened ready, and only needs a tap. */
  notice?: string | null;
  /** `h2` on the capture screen; `h3` inside the day sheet, which already
   *  has its own `h2`. Also picks the matching display size. */
  pendingHeadingTag?: "h2" | "h3";
  typedLabel?: string;
  loggedPrefix?: string;
  /** Scroll the pending-review block into view the moment it appears. Only
   *  the capture screen needs this: a review card can land below several
   *  rows of today's list, off the bottom of a phone screen, where a tap
   *  can otherwise look like it did nothing. The day sheet doesn't need
   *  it — it's already the thing being looked at. */
  scrollToPending?: boolean;
  /** Spacing + layout for the pending block. Default assumes a `gap-16`/
   *  `gap-24` parent (the capture screen); `DayCapture` passes its own
   *  margin-based override. */
  pendingClassName?: string;
  /** Open a just-logged entry for correction. With it, each entry in the
   *  "Logged" confirmation is a button: a mishear is fixed by tapping what is
   *  wrong, where it used to mean Undo and saying the whole thing again. */
  onEdit?: (transaction: Transaction) => void;
}) {
  const reviewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollToPending && capture.pending.length > 0) {
      reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [scrollToPending, capture.pending.length]);

  const Heading = pendingHeadingTag;

  return (
    <>
    <section className="flex flex-col items-start">
      <div className="w-full">
        <WaveformButton
          state={capture.state}
          level={capture.level}
          busy={capture.busy}
          onStart={capture.start}
          onStop={capture.stop}
        />
      </div>

      {/* The speaker's own words, back within a moment of stopping, while the
          expense is still being worked out. Waiting on a blank screen was the
          complaint; this is also the earliest a mishear can be seen. */}
      {capture.heard ? (
        <p
          aria-live="polite"
          className="rise mt-4 max-w-[420px] font-figtree text-body-sm text-charcoal"
        >
          <span className="text-fog">Heard </span>“{capture.heard}”
        </p>
      ) : null}

      {/* Typing the same thing you'd say. The behaviour the product was
          modelled on, and the reason a refused mic isn't a dead end. */}
      <form
        className="mt-4 flex w-full max-w-[420px] items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void capture.submitTyped();
        }}
      >
        <input
          value={capture.typed}
          onChange={(e) => capture.setTyped(e.target.value)}
          placeholder="…or type it: 250 lunch"
          aria-label={typedLabel}
          data-typed-entry
          enterKeyHint="done"
          className="focus-ring min-w-0 flex-1 rounded-[var(--radius-input)] border-2 border-vast-ink bg-paper-raised px-4 py-3 font-figtree text-body-sm text-vast-ink outline-none placeholder:text-fog focus:border-forest-ink"
        />
        <button
          type="submit"
          disabled={!capture.typed.trim() || capture.busy}
          className={[
            "focus-ring shrink-0 rounded-[var(--radius-input)] border-2 border-vast-ink px-5 py-3",
            "font-figtree text-body-sm font-medium text-vast-ink",
            !capture.typed.trim() || capture.busy
              ? "cursor-not-allowed bg-paper-edge opacity-60"
              : "bg-mint-whisper active:bg-mint-deep",
          ].join(" ")}
        >
          Add
        </button>
      </form>

      {notice ? (
        <p
          role="status"
          className="mt-6 max-w-[60ch] rounded-[var(--radius-input)] border-2 border-vast-ink bg-mint-whisper px-4 py-3 font-figtree text-body-sm text-vast-ink"
        >
          {notice}
        </p>
      ) : null}

      {capture.error ? (
        <p className="mt-6 max-w-[60ch] rounded-[var(--radius-input)] border-2 border-alert bg-paper-raised px-4 py-3 font-figtree text-body-sm text-alert">
          {capture.error}
        </p>
      ) : null}

      {/* Auto-logged entries announce themselves and stay undoable. Saving
          without asking is only acceptable if reversing it is trivial. */}
      {capture.justSaved && capture.justSaved.length > 0 ? (
        <div className="rise mt-6 flex w-full max-w-[420px] flex-wrap items-center justify-between gap-3 rounded-[var(--radius-input)] border-2 border-vast-ink bg-mint-whisper px-4 py-3">
          <span className="font-figtree text-body-sm text-vast-ink">
            {loggedPrefix}{" "}
            {capture.justSaved.map((t, i) => {
              const entry = (
                <>
                  <span className="money">₹{t.amount.value}</span>{" "}
                  {t.description.value ?? ""}
                </>
              );
              return (
                <span key={t.id}>
                  {i > 0 ? " · " : ""}
                  {onEdit ? (
                    <button
                      type="button"
                      onClick={() => onEdit(t)}
                      aria-label={`Fix ₹${t.amount.value} ${t.description.value ?? ""}`.trim()}
                      className="focus-ring underline decoration-dotted underline-offset-4"
                    >
                      {entry}
                    </button>
                  ) : (
                    entry
                  )}
                </span>
              );
            })}
          </span>
          <button
            type="button"
            onClick={capture.undo}
            className="focus-ring -my-3 inline-block px-1 py-3 font-figtree text-body-sm font-medium text-vast-ink underline underline-offset-4"
          >
            Undo
          </button>
        </div>
      ) : null}

      {/* There is no console on a phone. This line is how a failure becomes
          diagnosable instead of just "it doesn't work". */}
      {capture.debug ? (
        <p className="mt-3 max-w-[60ch] break-words font-figtree text-caption text-fog">
          {capture.debug}
        </p>
      ) : null}
    </section>

    {capture.pending.length > 0 ? (
      <div ref={reviewRef} className={pendingClassName}>
        <Heading
          className={[
            "display-type text-vast-ink",
            pendingHeadingTag === "h3" ? "text-subheading" : "text-heading-sm",
          ].join(" ")}
        >
          {capture.pending.length === 1
            ? "Check this before it’s saved"
            : `Check these ${capture.pending.length} before they’re saved`}
        </Heading>
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
    </>
  );
}

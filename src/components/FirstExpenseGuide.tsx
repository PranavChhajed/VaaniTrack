"use client";

import { useEffect } from "react";
import { guideLine, setFirstRunStage, stageFor, useFirstRunStage } from "@/lib/firstRun";
import { saveSettings, useSettings } from "@/lib/settings";
import { markWidgetSynced, useAndroidShell, useWidgetSync, widgetLink } from "@/lib/shell";
import type { Capture } from "@/lib/useCapture";

/**
 * What follows the welcome tour, on the real capture screen.
 *
 * First: help with the first expense. The card reads the recorder the screen
 * already has and says the next thing to do, so it teaches the real button
 * and adds no recording of its own. Then, once an expense is in the journal:
 * one suggestion for keeping the app a tap away. On the Android app that is
 * the home-screen widget, and the button here connects it and has Android
 * offer to place it. Everywhere else it is the home-screen icon and the
 * "start listening when I open the app" switch.
 *
 * Shown once and never forced: both cards can be put away, and neither comes
 * back. Someone who used the app before this existed never sees either. The
 * stages are in `src/lib/firstRun.ts`.
 */

const card =
  "rise rounded-[var(--radius-card)] border-2 border-vast-ink bg-paper-raised px-5 py-5";
const button =
  "focus-ring rounded-[var(--radius-pill)] border-2 border-vast-ink px-6 py-3 text-center font-figtree text-body-sm font-medium text-vast-ink";
const buttonMint = `${button} bg-mint-whisper active:bg-mint-deep`;
const buttonQuiet = `${button} bg-paper active:bg-paper-edge`;
const quietLink =
  "focus-ring -my-2 px-1 py-2 font-figtree text-body-sm text-charcoal underline underline-offset-4 hover:text-vast-ink";

export function FirstExpenseGuide({
  capture,
  entries,
}: {
  capture: Pick<Capture, "state" | "busy" | "error" | "pending">;
  /** How many expenses the journal holds, all days. */
  entries: number;
}) {
  const stage = useFirstRunStage();
  const androidApp = useAndroidShell();
  const widgetSync = useWidgetSync();
  const settings = useSettings();

  // The guide ends the moment there is an expense, however it got there.
  useEffect(() => {
    const next = stageFor(stage, entries);
    if (next !== stage) setFirstRunStage(next);
  }, [stage, entries]);

  if (stage === null) return null;
  const done = () => setFirstRunStage(null);

  if (stage === "guide") {
    // Shown as "next" straight away rather than for one frame as the guide.
    if (entries > 0) return null;
    const line = guideLine({
      state: capture.state,
      busy: capture.busy,
      failed: Boolean(capture.error),
      toCheck: capture.pending.length,
    });
    return (
      <section aria-label="Your first expense" className={`${card} -mb-10 sm:-mb-16`}>
        <p className="font-figtree text-caption font-semibold uppercase tracking-[0.08em] text-charcoal">
          Your first expense
        </p>
        {/* Polite, so a screen reader hears each next step without losing its place. */}
        <div aria-live="polite">
          <h2 className="mt-2 font-figtree text-subheading font-bold text-vast-ink">{line.title}</h2>
          <p className="mt-2 max-w-[44ch] font-figtree text-body-sm text-charcoal">{line.body}</p>
        </div>
        <button type="button" onClick={done} className={`${quietLink} mt-3`}>
          Not now
        </button>
      </section>
    );
  }

  const link = androidApp ? widgetLink() : null;
  const connected = widgetSync === "current";

  return (
    <section aria-label="What next" className={`${card} -mb-10 sm:-mb-16`}>
      <p className="font-figtree text-caption font-semibold uppercase tracking-[0.08em] text-forest-ink">
        That’s your first one ✓
      </p>
      <p className="mt-2 max-w-[44ch] font-figtree text-body-sm text-charcoal">
        It is on today’s list below and in the Journal. Tap it to change it, or Undo to take it back.
      </p>

      <div className="mt-5 border-t-2 border-paper-edge pt-5">
        {link ? (
          <>
            <h2 className="font-figtree text-subheading font-bold text-vast-ink">
              {connected ? "The widget is connected" : "Put the record button on your home screen"}
            </h2>
            <p className="mt-2 max-w-[44ch] font-figtree text-body-sm text-charcoal">
              {connected
                ? "If your phone didn’t offer to add it: press and hold your home screen, choose Widgets, then VaaniTrack."
                : "With the widget you record an expense without opening the app. Your phone asks once for the microphone, then offers to add it."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
              {connected ? (
                <button type="button" onClick={done} className={buttonMint}>
                  Done
                </button>
              ) : (
                <>
                  <a href={link} onClick={markWidgetSynced} className={buttonMint}>
                    Add the widget
                  </a>
                  <button type="button" onClick={done} className={quietLink}>
                    Not now
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <h2 className="font-figtree text-subheading font-bold text-vast-ink">Keep it one tap away</h2>
            <p className="mt-2 max-w-[44ch] font-figtree text-body-sm text-charcoal">
              Add VaaniTrack to your home screen, and it can start listening the moment it opens.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
              {settings.openToRecord ? (
                <p className="font-figtree text-body-sm font-medium text-forest-ink">
                  On. It will listen as it opens.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => saveSettings({ openToRecord: true })}
                  className={buttonQuiet}
                >
                  Start listening when I open the app
                </button>
              )}
              <button type="button" onClick={done} className={settings.openToRecord ? buttonMint : quietLink}>
                {settings.openToRecord ? "Done" : "Not now"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

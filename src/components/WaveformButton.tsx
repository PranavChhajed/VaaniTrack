"use client";

import type { RecorderState } from "@/lib/useRecorder";

/**
 * The capture affordance.
 *
 * The Wispr Flow reference specifies a "waveform visualizer": a pill with a 2px ink border
 * containing 5–7 pulsing bars, described as the mic-active indicator. Here that
 * component is promoted from decoration to the primary action, which is what it
 * always wanted to be in a voice-first product.
 *
 * Idle it wears the primary-action fill. Recording, it switches to Ember Glow,
 * which that reference reserves for exactly this: "active mic indicators".
 */

const BAR_COUNT = 7;
const BASE_HEIGHTS = [0.45, 0.7, 1, 0.85, 1, 0.7, 0.45];

export function WaveformButton({
  state,
  level,
  busy,
  onStart,
  onStop,
}: {
  state: RecorderState;
  level: number;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const recording = state === "recording";
  // The mic is open but not yet carrying sound. Shown, not hidden: the whole
  // failure this state exists to prevent was someone speaking during it,
  // which they did because the button looked exactly like it does when idle.
  const warming = state === "warming";
  const disabled = busy || state === "requesting" || warming;

  return (
    <button
      type="button"
      onClick={recording ? onStop : onStart}
      disabled={disabled}
      // The name must contain the words on the button: someone using voice
      // control says what they read ("tap Say what you spent"), and a name that
      // paraphrases it is a button they cannot reach.
      aria-label={
        busy
          ? "Reading it back…"
          : recording
            ? "Tap to finish recording"
            : warming
              ? "Getting the mic ready…"
              : "Say what you spent"
      }
      aria-live="polite"
      className={[
        "focus-ring group relative inline-flex items-center justify-center gap-2",
        "h-[112px] w-full max-w-[420px] rounded-[var(--radius-pill)] border-2 border-vast-ink",
        "transition-colors duration-200",
        recording || warming ? "bg-ember-glow" : "bg-mint-whisper",
        // Dimmed while warming, but not to the flat disabled grey: the mic is
        // genuinely opening, and this reads as a step in progress rather than
        // as a dead control.
        disabled ? (warming ? "cursor-wait opacity-80" : "cursor-not-allowed opacity-60") : "cursor-pointer",
        !disabled && !recording ? "hover:bg-forest-ink active:bg-mint-deep" : "",
      ].join(" ")}
    >
      {busy ? (
        <>
          <span className="flex items-end gap-[5px]" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="wave-bar block h-5 w-[6px] rounded-full bg-vast-ink"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </span>
          <span className="ml-3 font-figtree text-body font-medium text-vast-ink">
            Reading it back…
          </span>
        </>
      ) : (
        <>
          <span className="flex items-end gap-[7px]" aria-hidden="true">
            {BASE_HEIGHTS.slice(0, BAR_COUNT).map((base, i) => {
              const height = recording
                ? 10 + base * (20 + level * 36)
                : 10 + base * 20;
              return (
                <span
                  key={i}
                  className={[
                    "block w-[6px] rounded-full bg-vast-ink",
                    recording ? "wave-bar" : "",
                    !recording ? "transition-colors group-hover:bg-paper" : "",
                  ].join(" ")}
                  style={{
                    height: `${height}px`,
                    animationDelay: `${i * 90}ms`,
                  }}
                />
              );
            })}
          </span>
          <span
            className={[
              "ml-3 font-figtree text-body font-medium",
              recording
                ? "text-vast-ink"
                : "text-vast-ink transition-colors group-hover:text-paper",
            ].join(" ")}
          >
            {recording
              ? "Tap to finish"
              : warming
                ? "Getting the mic ready…"
                : "Say what you spent"}
          </span>
        </>
      )}
    </button>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "listening" | "heard" | "settled";

const CAPTIONS: Record<Phase, string> = {
  idle: "Say what you spent",
  listening: "Listening…",
  heard: "Heard it",
  settled: "Checked. Saved.",
};

const BAR_HEIGHTS = [10, 16, 22, 16, 10];

/**
 * The hero's demo: the entire product loop, felt once in about three
 * seconds, rather than told across a paragraph and a separate illustration.
 * Reuses `.wave-bar` from `WaveformButton.tsx` so this is the same visual
 * object as the capture screen's own control, not a lookalike of it.
 *
 * ₹250 and Lunch render in plain ink because both were actually said in
 * "250 lunch". Only "Today" gets the `.prov-inferred` underline, because
 * it's the one part of this example nobody spoke, which is the product's
 * real said/inferred distinction used correctly rather than a generic mock.
 */
export function HeroDemo() {
  const [phase, setPhase] = useState<Phase>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    play();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function play() {
    clearTimers();
    if (reducedMotion.current) {
      setPhase("settled");
      return;
    }
    setPhase("idle");
    timers.current.push(setTimeout(() => setPhase("listening"), 600));
    timers.current.push(setTimeout(() => setPhase("heard"), 2000));
    timers.current.push(setTimeout(() => setPhase("settled"), 2900));
  }

  const listening = phase === "listening";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Replay the demo"
      onClick={play}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          play();
        }
      }}
      className="focus-ring w-full max-w-[420px] cursor-pointer rounded-[var(--radius-card)] border-2 border-vast-ink bg-paper-raised px-6 py-6"
    >
      <div className="flex items-center gap-3">
        <span className="flex items-end gap-[4px]" aria-hidden="true">
          {BAR_HEIGHTS.map((h, i) => (
            <span
              key={i}
              className={`block w-[4px] rounded-full bg-vast-ink ${listening ? "wave-bar" : ""}`}
              style={{
                height: `${listening ? h + 10 : h}px`,
                animationDelay: `${i * 90}ms`,
              }}
            />
          ))}
        </span>
        <span className="font-figtree text-body-sm font-medium text-vast-ink">
          {CAPTIONS[phase]}
        </span>
      </div>

      <div className="mt-5 min-h-[44px]">
        {phase === "heard" && (
          <p
            key="heard"
            className="rise font-figtree text-body italic text-charcoal"
          >
            &ldquo;250 lunch&rdquo;
          </p>
        )}
        {phase === "settled" && (
          <p
            key="settled"
            className="rise flex flex-wrap items-baseline gap-x-2 gap-y-1"
          >
            <span className="money text-heading-sm text-vast-ink">₹250</span>
            <span className="font-figtree text-body-sm text-charcoal">
              Lunch ·
            </span>
            <span className="prov-inferred font-figtree text-body-sm text-charcoal">
              Today
            </span>
          </p>
        )}
      </div>

      <p
        className={`mt-4 font-figtree text-caption text-fog transition-opacity duration-300 ${
          phase === "settled" ? "opacity-100" : "opacity-0"
        }`}
      >
        Tap to replay
      </p>
    </div>
  );
}

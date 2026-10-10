"use client";

import { useState } from "react";
import { Logo } from "@/components/Logo";
import { LedgerArt, ReceiptArt, SpeechArt } from "@/components/OnboardingArt";
import {
  audioConsent,
  useOnboarded,
  setAudioConsent,
  setOnboarded,
} from "@/lib/device";

/**
 * The first-run flow. docs/design/AUTH-ONBOARDING.md §4.
 *
 * Three explainers, then the consent question as a fourth step rather than
 * an unexplained modal. Built as an overlay in the same shape as
 * `AudioConsentGate`: state starts `null`, storage is read in an effect, so
 * server and first client render agree and nothing flashes.
 *
 * This does not replace `AudioConsentGate`. That component keeps working
 * unchanged for every browser that has already onboarded but never
 * answered consent (existing users). This overlay's own step 4 writes the
 * same `vaanitrack.audioConsent` key, so the two never both appear.
 *
 * The consent step is deliberately not a "Next" step: it keeps two
 * equal-weight buttons, because a Next that also means "I agree" is a dark
 * pattern the existing consent component goes out of its way to avoid.
 * Skip is offered on steps 1-3, in the header, and jumps straight to
 * consent; it never skips past it.
 */

type Step = {
  heading: string;
  body: string;
  tint: string;
  Art: () => React.JSX.Element;
};

const STEPS: Step[] = [
  {
    heading: "Say what you spent",
    body: "Speak it the way you'd text yourself. “250 lunch” is a whole entry.",
    tint: "bg-mint-whisper",
    Art: SpeechArt,
  },
  {
    heading: "Check it before it's saved",
    body: "Every field shows whether it was heard, worked out, or left blank. Nothing is guessed.",
    tint: "bg-tint-sage",
    Art: ReceiptArt,
  },
  {
    heading: "Your money, in your words",
    body: "The journal keeps the record readable, and correctable when it's wrong.",
    tint: "bg-paper",
    Art: LedgerArt,
  },
];

const CONSENT_STEP = STEPS.length; // index 3
const TOTAL_STEPS = STEPS.length + 1;

/** The wordmark row, on every step, with an optional Skip in the same row so
 *  the footer can stay down to a single action. Consent passes no `onSkip`:
 *  it is the one step that is never skippable. */
function FlowHeader({ onSkip }: { onSkip?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2">
        <Logo size={32} />
        <span className="display-type text-body-sm text-vast-ink">VaaniTrack</span>
      </span>
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="focus-ring -my-3 inline-block px-1 py-3 font-figtree text-body-sm text-fog underline underline-offset-4 hover:text-vast-ink"
        >
          Skip
        </button>
      )}
    </div>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <div
      className="flex gap-2"
      role="progressbar"
      aria-valuenow={step + 1}
      aria-valuemin={1}
      aria-valuemax={TOTAL_STEPS}
    >
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <span
          key={i}
          className={`h-[4px] flex-1 rounded-full ${i <= step ? "bg-vast-ink" : "bg-vast-ink/20"}`}
        />
      ))}
    </div>
  );
}

export function Onboarding() {
  // Three states: null (not yet read, render nothing, matching
  // AudioConsentGate's approach to avoiding a hydration mismatch),
  // true (done, render nothing), false (run the flow).
  const onboarded = useOnboarded();
  const [step, setStep] = useState(0);

  if (onboarded === null || onboarded === true) return null;

  const finish = (consent: "granted" | "denied") => {
    // Only step 4 ever calls this, see the consent-step buttons below.
    // Only write consent if it's genuinely still unknown: someone who
    // reached onboarding after already answering (an edge case, not the
    // common path) must not have that answer silently overwritten.
    if (audioConsent() === "unknown") setAudioConsent(consent);
    setOnboarded();
  };

  if (step === CONSENT_STEP) {
    return (
      <div className="fixed inset-0 z-[70] flex min-h-dvh flex-col bg-paper px-6 py-8">
        <FlowHeader />
        <div className="mt-10 flex flex-1 flex-col items-start justify-center">
          <p className="display-type text-subheading text-fog">Welcome to VaaniTrack.</p>
          <h2 className="display-type mt-2 text-heading-sm text-vast-ink">
            Can we keep your recordings?
          </h2>
          <p className="mt-4 max-w-[46ch] font-figtree text-body-sm text-charcoal">
            VaaniTrack sometimes mishears an amount. Keeping the recording helps
            us tell whether it was misheard or misunderstood, so it can improve.
          </p>
          <ul className="mt-4 flex flex-col gap-2 font-figtree text-body-sm text-charcoal">
            <li>&middot; Recordings are deleted after 90 days.</li>
            <li>&middot; Only you and the developer can access them.</li>
            <li>&middot; You can say no and everything still works.</li>
          </ul>
        </div>
        <div className="flex flex-col gap-3">
          <Progress step={step} />
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => finish("granted")}
              className="focus-ring flex-1 rounded-[var(--radius-button)] border-2 border-vast-ink bg-mint-whisper px-5 py-3 font-figtree text-body-sm font-medium text-vast-ink active:bg-mint-deep"
            >
              Yes, keep them
            </button>
            <button
              type="button"
              onClick={() => finish("denied")}
              className="focus-ring flex-1 rounded-[var(--radius-button)] border-2 border-vast-ink bg-paper-raised px-5 py-3 font-figtree text-body-sm text-vast-ink active:bg-paper-edge"
            >
              No, don&rsquo;t
            </button>
          </div>
        </div>
      </div>
    );
  }

  const current = STEPS[step];
  const Art = current.Art;

  return (
    <div className={`fixed inset-0 z-[70] flex min-h-dvh flex-col px-6 py-8 ${current.tint}`}>
      <FlowHeader onSkip={() => setStep(CONSENT_STEP)} />

      <div key={step} className="rise mt-10">
        <p className="font-figtree text-caption font-semibold uppercase tracking-[0.08em] text-fog">
          {String(step + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
        </p>
        <h1 className="mt-3 max-w-[16ch] font-figtree text-heading-sm font-bold text-vast-ink sm:text-heading">
          {current.heading}
        </h1>
        <p className="mt-4 max-w-[38ch] font-figtree text-body text-fog">{current.body}</p>
      </div>

      <div className="flex flex-1 items-center justify-center py-6">
        <div className="h-[160px] w-full max-w-[220px] sm:h-[200px]">
          <Art />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Progress step={step} />
        <button
          type="button"
          onClick={() => setStep((s) => s + 1)}
          className="focus-ring w-full rounded-[var(--radius-pill)] border-2 border-vast-ink bg-mint-whisper px-6 py-4 font-figtree text-body-sm font-medium text-vast-ink active:bg-mint-deep"
        >
          Next
        </button>
      </div>
    </div>
  );
}

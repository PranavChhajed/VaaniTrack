"use client";

import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { SayItArt, SureArt, WeekArt } from "@/components/OnboardingArt";
import {
  audioConsent,
  replayTour,
  setAudioConsent,
  setOnboarded,
  useOnboarded,
  useTourReplay,
} from "@/lib/device";
import { setFirstRunStage, shouldGuide } from "@/lib/firstRun";
import { useTransactions } from "@/lib/useTransactions";

/**
 * The first-run flow. docs/design/AUTH-ONBOARDING.md §4.
 *
 * Three explainers, then the recordings question as a fourth step rather than
 * an unexplained modal. Each explainer is one thing a person does, not one
 * feature: say it, trust what was saved, see where it went. What comes next
 * (recording a first expense, and putting the app a tap away) is not told
 * here but done, on the real capture screen: see `FirstExpenseGuide`.
 *
 * Built as an overlay in the same shape as `AudioConsentGate`: state starts
 * `null`, storage is read in an effect, so server and first client render
 * agree and nothing flashes.
 *
 * This does not replace `AudioConsentGate`. That component keeps working
 * unchanged for every browser that has already onboarded but never answered
 * consent. This overlay's own last step writes the same
 * `vaanitrack.audioConsent` key, so the two never both appear.
 *
 * The consent step is deliberately not a "Next" step: it keeps two
 * equal-weight buttons, because a Next that also means "I agree" is a dark
 * pattern the consent component goes out of its way to avoid. Skip is offered
 * on the explainers and jumps straight to consent; it never skips past it.
 *
 * Asked for again from the You screen, the same explainers are shown and the
 * question is not: it has been answered, and a tour is not a reason to ask
 * twice. That run ends on Done and stores nothing.
 */

type Step = {
  heading: string;
  body: string;
  /** A smaller line under the body: a limit or a promise worth stating once. */
  note: string;
  tint: string;
  Art: () => React.JSX.Element;
};

const STEPS: Step[] = [
  {
    heading: "Say what you spent",
    body: "“250 lunch” is a whole entry. Speak it, or type it.",
    note: "English for now. Amounts in Hindi, like “dhai sau”, are understood.",
    tint: "bg-mint-whisper",
    Art: SayItArt,
  },
  {
    heading: "Sure? Saved. Not sure? It asks.",
    body: "A clear expense is saved at once, with Undo. If something wasn’t heard properly, it shows you first.",
    note: "Nothing is guessed.",
    tint: "bg-tint-sage",
    Art: SureArt,
  },
  {
    heading: "See where it went",
    body: "The Journal keeps every day. Insights adds up your week.",
    note: "It stays on this phone. No account needed.",
    tint: "bg-paper",
    Art: WeekArt,
  },
];

const CONSENT_STEP = STEPS.length;
const TOTAL_STEPS = STEPS.length + 1;

/* A fixed-height column: header on top, the footer (progress and the one big button) pinned to
   the bottom, and only the middle scrolls. The button used to sit at the end of a taller-than-the-
   screen column, so on a short phone, or on its side, the one thing to press began off-screen. */
const shell =
  "fixed inset-0 z-[70] flex h-dvh flex-col overscroll-contain px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-10";
const middle = "min-h-0 flex-1 overflow-y-auto overscroll-contain";
const quietLink =
  "focus-ring -my-3 inline-block px-1 py-3 font-figtree text-body-sm text-charcoal underline underline-offset-4 hover:text-vast-ink";

/** The wordmark row, on every step, with Back and Skip in the same row so the
 *  footer can stay down to a single action. Consent passes no `onSkip`: it is
 *  the one step that is never skippable. */
function FlowHeader({
  onBack,
  onSkip,
  skipLabel = "Skip",
}: {
  onBack?: () => void;
  onSkip?: () => void;
  skipLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2">
        <Logo size={32} />
        <span className="display-type text-body-sm text-vast-ink">VaaniTrack</span>
      </span>
      <span className="flex items-center gap-4">
        {onBack && (
          <button type="button" onClick={onBack} className={quietLink}>
            Back
          </button>
        )}
        {onSkip && (
          <button type="button" onClick={onSkip} className={quietLink}>
            {skipLabel}
          </button>
        )}
      </span>
    </div>
  );
}

function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div
      className="flex gap-2"
      role="progressbar"
      aria-label="Welcome tour"
      aria-valuetext={`Step ${step + 1} of ${total}`}
      aria-valuenow={step + 1}
      aria-valuemin={1}
      aria-valuemax={total}
    >
      {Array.from({ length: total }, (_, i) => (
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
  const replay = useTourReplay();
  const { transactions } = useTransactions();
  const [step, setStep] = useState(0);

  // Each step is a new screen to someone who cannot see it change: put them
  // at its heading, the way a page load would.
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRun = onboarded === false;
  const showing = firstRun || replay;
  useEffect(() => {
    if (showing) heading.current?.focus();
  }, [step, showing]);

  // The launch veil (FirstRunVeil.tsx) only has to cover the gap until this has read the device.
  // The tour sits above it; once the answer is known, whichever it is, the veil is done.
  useEffect(() => {
    if (onboarded !== null) document.documentElement.removeAttribute("data-first-run");
  }, [onboarded]);

  if (!showing) return null;

  const finish = (consent: "granted" | "denied") => {
    // Only the consent step ever calls this. Only write consent if it's
    // genuinely still unknown: someone who reached onboarding after already
    // answering must not have that answer silently overwritten.
    if (audioConsent() === "unknown") setAudioConsent(consent);
    // Someone who already has expenses here does not need showing how.
    if (shouldGuide(transactions.length)) setFirstRunStage("guide");
    setOnboarded();
    setStep(0);
  };

  const closeReplay = () => {
    replayTour(false);
    setStep(0);
  };

  if (firstRun && step === CONSENT_STEP) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Welcome to VaaniTrack" className={`${shell} bg-paper`}>
        <FlowHeader onBack={() => setStep(CONSENT_STEP - 1)} />
        <div className={`${middle} mt-6 flex flex-col`}>
         {/* my-auto centres this when there is room and lets it scroll from the top when there is not;
             justify-center would cut the top off a column taller than its box. */}
         <div className="my-auto">
          <p className="display-type text-subheading text-charcoal">One question first.</p>
          <h2 ref={heading} tabIndex={-1} className="display-type mt-2 text-heading-sm text-vast-ink outline-none">
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
        </div>
        <div className="mt-4 flex shrink-0 flex-col gap-3">
          <Progress step={step} total={TOTAL_STEPS} />
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

  const at = Math.min(step, STEPS.length - 1);
  const current = STEPS[at];
  const Art = current.Art;
  const last = at === STEPS.length - 1;
  const total = firstRun ? TOTAL_STEPS : STEPS.length;

  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome to VaaniTrack" className={`${shell} ${current.tint}`}>
      <FlowHeader
        onBack={at > 0 ? () => setStep(at - 1) : undefined}
        onSkip={firstRun ? () => setStep(CONSENT_STEP) : closeReplay}
        skipLabel={firstRun ? "Skip" : "Close"}
      />

      <div className={`${middle} mt-6 flex flex-col [@media(max-height:620px)]:mt-3`}>
        <div key={at} className="rise">
          <p className="font-figtree text-caption font-semibold uppercase tracking-[0.08em] text-charcoal">
            {String(at + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
          </p>
          <h1
            ref={heading}
            tabIndex={-1}
            className="mt-3 max-w-[16ch] font-figtree text-heading-sm font-bold text-vast-ink outline-none sm:text-heading"
          >
            {current.heading}
          </h1>
          <p className="mt-4 max-w-[38ch] font-figtree text-body text-charcoal">{current.body}</p>
          <p className="mt-2 max-w-[38ch] font-figtree text-body-sm text-charcoal">{current.note}</p>
        </div>

        {/* The picture takes whatever room is left, and gives way first: on a short screen it
            is the part that goes, never the words or the button. */}
        <div className="flex flex-1 items-center justify-center py-5 [@media(max-height:640px)]:hidden">
          <div key={at} className="w-full max-w-[320px]">
            <Art />
          </div>
        </div>
      </div>

      <div className="mt-3 flex shrink-0 flex-col gap-4">
        <Progress step={at} total={total} />
        <button
          type="button"
          onClick={() => (last && !firstRun ? closeReplay() : setStep(at + 1))}
          className="focus-ring w-full rounded-[var(--radius-pill)] border-2 border-vast-ink bg-vast-ink px-6 py-4 font-figtree text-body-sm font-medium text-paper active:bg-charcoal"
        >
          {last && !firstRun ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}

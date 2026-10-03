/** Shared between signin and signup: the input recipe (was byte-identical
 *  in both files) and the small heading accent both screens now carry. */

export const inputClass =
  "w-full rounded-[12px] border-2 border-vast-ink bg-paper px-4 py-3 font-figtree text-body-sm text-vast-ink focus:border-forest-ink focus-ring";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The same hand-drawn squiggle behind `.prov-inferred` in globals.css and
 *  `OnboardingArt.tsx`'s receipt, reused here as a small heading accent so
 *  the auth screens carry the one hand-drawn line the rest of the first-run
 *  flow does, instead of a bare heading. */
export function HeadingAccent() {
  return (
    <svg
      viewBox="0 0 60 6"
      preserveAspectRatio="none"
      className="mt-3 h-[6px] w-16"
      aria-hidden="true"
    >
      <path
        d="M1 4.2c8-2.4 15 1.4 22-.6s14-2.6 20 .4"
        stroke="var(--color-forest-ink)"
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

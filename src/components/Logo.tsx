/**
 * The VaaniTrack mark.
 *
 * One continuous hand-drawn stroke: it opens as a soft, wavering scribble —
 * the same organic bezier technique as `.prov-inferred`'s underline in
 * globals.css, standing in for something spoken and not yet certain — then
 * straightens into a clean checkmark. The path syntax itself carries the
 * idea: curves (`C`) give way to straight lines (`L`) at the exact point the
 * gesture resolves, so "uncertain becoming confirmed" is built into the data,
 * not just the rendered shape. It is the app's own words, drawn: *"Say what
 * you spent. Check it. Done."*
 *
 * Deliberately not a waveform. Bars-in-a-circle is what every voice app
 * reaches for, and it was this app's own borrowed motif before this
 * component existed (see the four-bar spans this replaces). A checkmark
 * reads correctly at any size, down to a 16px favicon, which a delicate
 * multi-wave squiggle alone would not survive.
 *
 * `LOGO_PATH` is exported so the PWA icon routes (`src/app/icon.tsx`,
 * `apple-icon.tsx`) render the exact same mark rather than a second,
 * drifting copy of it.
 */

export const LOGO_PATH =
  "M5 16 C7 12.5 8.5 19 10.5 15.5 C11.5 13.8 12.5 17.5 14 18.5 L17 22.5 L27 7";

type LogoProps = {
  /** Rendered size in px. The mark is square. */
  size?: number;
  /** Stroke colour. Defaults to Forest Ink, the app's ink-accent colour —
   *  the same colour the underline it borrows from already uses. */
  color?: string;
  className?: string;
};

export function Logo({ size = 28, color = "var(--color-forest-ink)", className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d={LOGO_PATH}
        stroke={color}
        strokeWidth={2.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The three onboarding illustrations. docs/design/THEME-ONBOARDING.md §79:
 * "if this reads as too thin once built, the fallback is an abstract mark";
 * it read as too thin, so this is that fallback, built.
 *
 * One shared language, matching `Logo.tsx`: monoline strokes, Forest Ink,
 * round caps and joins, no fills except the receipt's own paper colour, no
 * characters. `ReceiptArt`'s middle row deliberately reuses the exact
 * squiggle path from `.prov-inferred` in globals.css, the app's one piece
 * of visual vocabulary with a real meaning already attached, placed on the
 * one screen that explains what checking a capture means.
 */

const INK = "var(--color-forest-ink)";

export function SpeechArt() {
  return (
    <svg viewBox="0 0 200 160" fill="none" aria-hidden="true" className="h-full w-full">
      <path d="M40 90 C48 82 48 98 40 106" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <path d="M62 70 C80 78 80 118 62 126" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
      <path d="M92 55 C122 68 122 128 92 141" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <path d="M128 42 C168 60 168 136 128 154" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
    </svg>
  );
}

export function ReceiptArt() {
  return (
    <svg viewBox="0 0 200 170" fill="none" aria-hidden="true" className="h-full w-full">
      <g transform="rotate(-6 100 85)">
        <path
          d="M55 25 L145 25 L145 145 L130 132 L115 145 L100 132 L85 145 L70 132 L55 145 Z"
          stroke={INK}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="var(--color-paper)"
        />
        <line x1="70" y1="52" x2="130" y2="52" stroke={INK} strokeWidth={3} strokeLinecap="round" />
        <path
          d="M70 78 C85 72 95 84 108 78 C118 74 124 80 130 78"
          stroke={INK}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <line x1="70" y1="104" x2="115" y2="104" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function LedgerArt() {
  return (
    <svg viewBox="0 0 210 160" fill="none" aria-hidden="true" className="h-full w-full">
      <line x1="20" y1="35" x2="140" y2="35" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
      <line x1="20" y1="63" x2="120" y2="63" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
      <line x1="20" y1="91" x2="130" y2="91" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
      <line x1="20" y1="119" x2="95" y2="119" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
      <g transform="translate(148,42) scale(1.7)">
        <path d="M4 8 C8 6.2 12.5 9.5 17 8" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
        <path d="M4 15.5 C7 14 10 17 13 15.5" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
        <path
          d="M7 3 L7 15 Q14 16.3 22 32"
          stroke={INK}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

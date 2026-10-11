/**
 * The welcome tour's three pictures. docs/design/THEME-ONBOARDING.md §5.
 *
 * Each is a small piece of the real app rather than a drawing about it: the
 * card a capture lands on, the two ways a capture can end, and the Insights
 * week. They are built from the app's own classes (`.wave-bar`, `.money`,
 * `.prov-inferred`, `.prov-unknown`), so what a new person sees here is what
 * they meet a minute later, and a change to those classes changes these too.
 *
 * Pictures only: every one is hidden from a screen reader, which gets the
 * step's heading and words instead. Nothing here is Ember, because nothing
 * here is listening. Movement is the shared `.wave-bar` and `.rise`, both of
 * which are already stilled when the phone asks for reduced motion.
 */

const card =
  "w-full rounded-[var(--radius-card)] border-2 border-vast-ink bg-paper-raised px-5 py-4";

const BARS = [12, 20, 28, 20, 12];

/** Step 1: what was said, and the entry it became. */
export function SayItArt() {
  return (
    <div aria-hidden="true" className={card}>
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center gap-[3px] rounded-full border-2 border-vast-ink bg-mint-whisper">
          {BARS.map((h, i) => (
            <span
              key={i}
              className="wave-bar block w-[3px] rounded-full bg-vast-ink"
              style={{ height: `${h}px`, animationDelay: `${i * 90}ms` }}
            />
          ))}
        </span>
        <span className="font-figtree text-body italic text-charcoal">&ldquo;250 lunch&rdquo;</span>
      </div>
      <div className="mt-4 border-t-2 border-paper-edge pt-3">
        <p className="rise flex flex-wrap items-baseline gap-x-2 gap-y-1" style={{ animationDelay: "500ms" }}>
          <span className="money text-heading-sm text-vast-ink">₹250</span>
          <span className="font-figtree text-body-sm text-charcoal">Lunch ·</span>
          <span className="prov-inferred font-figtree text-body-sm text-charcoal">Today</span>
        </p>
      </div>
    </div>
  );
}

/** Step 2: the two ways a capture ends. Saved with Undo, or held to check. */
export function SureArt() {
  return (
    <div aria-hidden="true" className="flex w-full flex-col gap-3">
      <div className={`${card} flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1`}>
        <span className="flex items-baseline gap-2">
          <span className="money text-subheading text-vast-ink">₹250</span>
          <span className="font-figtree text-body-sm text-charcoal">Lunch</span>
        </span>
        <span className="font-figtree text-caption text-forest-ink">
          Saved ✓ <span className="ml-2 text-vast-ink underline underline-offset-4">Undo</span>
        </span>
      </div>
      <div className={`${card} rise flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1`} style={{ animationDelay: "400ms" }}>
        <span className="flex items-baseline gap-2">
          <span className="prov-unknown money px-2 text-subheading">₹&nbsp;?</span>
          <span className="font-figtree text-body-sm text-charcoal">To Pushpa</span>
        </span>
        <span className="font-figtree text-caption font-medium text-vast-ink">Check this</span>
      </div>
    </div>
  );
}

const WEEK = [35, 60, 20, 80, 45, 30, 65];

/** Step 3: the Insights week in miniature. Today's bar is the solid one. */
export function WeekArt() {
  return (
    <div aria-hidden="true" className={card}>
      <p className="font-figtree text-caption text-fog">Last 7 days</p>
      <p className="money mt-1 text-heading-sm text-vast-ink">₹2,340</p>
      <div className="mt-4 flex h-16 items-end gap-2">
        {WEEK.map((h, i) => (
          <span
            key={i}
            className={`rise flex-1 rounded-t-[4px] ${i === WEEK.length - 1 ? "bg-vast-ink" : "bg-vast-ink/20"}`}
            style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ---- The landing page’s three line drawings -------------------------
   Monoline Forest Ink, matching `Logo.tsx`. The tour used these until it was
   rebuilt around pieces of the real app; `/` still does. */

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

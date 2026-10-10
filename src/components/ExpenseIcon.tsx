import type { IconKind } from "@/lib/icon";

/**
 * The picture at the start of a transaction row.
 *
 * Drawn here as line art rather than set as emoji. An emoji is the phone's
 * drawing, not the app's: the same car is a different picture on every
 * handset, in colours this palette does not contain. These are one stroke
 * weight in the chamber's own mint, on a forest tile.
 *
 * Decorative: the row's text already says what it is, so the tile is hidden
 * from assistive technology rather than announced as a second, vaguer label.
 */
const PATHS: Record<IconKind, string[]> = {
  food: [
    "M7 3v6a2 2 0 0 0 4 0V3",
    "M9 3v18",
    "M17 21V3c-2 1.5-3 4-3 8h3",
  ],
  drink: [
    "M6.5 9h11l-1 10.2a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8L6.5 9z",
    "M5 9h14",
    "M12 9l1.4-5 3.1-1",
  ],
  transport: [
    "M5 11l1.4-4.2A2 2 0 0 1 8.3 5.4h7.4a2 2 0 0 1 1.9 1.4L19 11",
    "M4.5 11h15a1.5 1.5 0 0 1 1.5 1.5V17H3v-4.5A1.5 1.5 0 0 1 4.5 11z",
    "M6 17v2",
    "M18 17v2",
    "M7 14h.01",
    "M17 14h.01",
  ],
  shopping: [
    "M6 8h12l1 12.5H5L6 8z",
    "M9 8V7a3 3 0 0 1 6 0v1",
  ],
  bills: ["M13 3L5 13.5h6L10 21l9-10.5h-6L13 3z"],
  person: [
    "M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    "M5 20a7 7 0 0 1 14 0",
  ],
  receipt: [
    "M7 3h10v18l-2.5-1.6L12 21l-2.5-1.6L7 21V3z",
    "M10 8h4",
    "M10 12h4",
  ],
};

export function ExpenseIcon({ kind }: { kind: IconKind }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-forest-ink"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6 fill-none stroke-mint-whisper"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {PATHS[kind].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}

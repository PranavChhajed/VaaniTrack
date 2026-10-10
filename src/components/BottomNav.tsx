"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The way between the app's two screens.
 *
 * It used to be one small underlined link in the header: "Journal ›" on one
 * screen, "‹ Capture" on the other. That is a long reach on a phone held in
 * one hand, and it never said where you were, only where else you could go.
 * This sits under the thumb and shows both.
 *
 * Mounted once in `(app)/layout.tsx`, so it belongs to capture and journal
 * and to nothing else. It stays below the sheets (`z-40` against their
 * `z-50`): a sheet is somewhere you are in the middle of, and the way out of
 * it is its own close button, not a tab.
 */
const TABS = [
  {
    href: "/app",
    label: "Capture",
    // The waveform, the same shape the record button carries.
    paths: ["M6 10v4", "M9.5 7v10", "M13 4.5v15", "M16.5 8v8", "M20 10.5v3"],
  },
  {
    href: "/journal",
    label: "Journal",
    paths: [
      "M5 4.5h11a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3V4.5z",
      "M5 17a3 3 0 0 1 3-3h11",
      "M9 8.5h6",
    ],
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Screens"
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-paper-edge bg-paper px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"
    >
      <div className="mx-auto flex w-full max-w-[420px] gap-1 rounded-[var(--radius-pill)] border-2 border-vast-ink bg-paper-raised p-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={[
                "focus-ring flex h-12 flex-1 items-center justify-center gap-2 rounded-[var(--radius-pill)]",
                "font-figtree text-body-sm font-medium transition-colors",
                active
                  ? "bg-vast-ink text-paper"
                  : "text-charcoal active:bg-mint-whisper",
              ].join(" ")}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5 fill-none stroke-current"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {tab.paths.map((d) => (
                  <path key={d} d={d} />
                ))}
              </svg>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

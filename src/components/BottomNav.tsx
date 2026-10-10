"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The way between the app's three screens: capture, journal, insights.
 *
 * It used to be one small underlined link in the header: "Journal ›" on one
 * screen, "‹ Capture" on the other. That is a long reach on a phone held in
 * one hand, and it never said where you were, only where else you could go.
 * This sits under the thumb and shows all of them.
 *
 * Mounted once in `(app)/layout.tsx`, so it belongs to the app's screens and to
 * nothing else. It stays below the sheets (`z-40` against their `z-50`): a
 * sheet is somewhere you are in the middle of, and the way out of it is its own
 * close button, not a tab.
 *
 * It is a floating pill of liquid glass (`.glass-bar` in globals.css). The
 * selected tab is a second pane of glass, the lens, that slides to the new
 * tab. Every tab is the same width, so the lens moves by whole multiples of
 * its own width and needs no measuring. On a screen that is not a tab (You)
 * the lens is simply hidden.
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
  {
    href: "/insights",
    label: "Insights",
    // Three bars of different heights.
    paths: ["M6 20v-6", "M12 20V5", "M18 20v-9"],
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const active = TABS.findIndex((tab) => tab.href === pathname);

  return (
    <nav
      aria-label="Screens"
      // The strip itself does not catch taps, so the thin margins either side
      // of the pill stay part of the page beneath.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"
    >
      <div className="glass-bar pointer-events-auto relative mx-auto grid w-full max-w-[420px] grid-cols-3 rounded-[var(--radius-pill)] p-1">
        <span
          aria-hidden="true"
          className={[
            "glass-lens pointer-events-none absolute bottom-1 left-1 top-1 w-[calc((100%-0.5rem)/3)] rounded-[var(--radius-pill)]",
            active === -1 ? "opacity-0" : "opacity-100",
          ].join(" ")}
          style={{ transform: `translateX(${Math.max(active, 0) * 100}%)` }}
        />
        {TABS.map((tab, i) => {
          const current = i === active;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={current ? "page" : undefined}
              className={[
                "focus-ring relative z-10 flex h-12 items-center justify-center gap-2 rounded-[var(--radius-pill)]",
                "font-figtree text-body-sm transition-[color,transform] duration-200 active:scale-95",
                current ? "font-semibold text-vast-ink" : "font-medium text-charcoal",
              ].join(" ")}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5 fill-none stroke-current"
                strokeWidth={current ? 2 : 1.75}
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

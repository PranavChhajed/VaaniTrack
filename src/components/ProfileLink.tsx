"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { initialOf, useSettings } from "@/lib/settings";

/**
 * The way to the You screen: the person's initial, or a plain figure until
 * they have given a name.
 *
 * It replaces the "Sign in" link inside the app. Signing in is a stub (no
 * account moves anything anywhere yet), whereas this leads to things that
 * change what the app does today.
 */
export function ProfileLink() {
  const { name } = useSettings();
  const pathname = usePathname();
  const initial = initialOf(name);
  const here = pathname === "/you";

  return (
    <Link
      href="/you"
      aria-label={initial ? `You, ${name.trim()}` : "You"}
      aria-current={here ? "page" : undefined}
      className={[
        "focus-ring flex h-11 w-11 items-center justify-center rounded-full border-2 border-vast-ink",
        "font-figtree text-body-sm font-semibold transition-colors",
        here ? "bg-vast-ink text-paper" : "bg-mint-whisper text-vast-ink active:bg-mint-deep",
      ].join(" ")}
    >
      {initial ?? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-5 w-5 fill-none stroke-current"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      )}
    </Link>
  );
}

import Link from "next/link";
import { Logo } from "@/components/Logo";

type AppHeaderProps = {
  /** Where the header's one navigation link goes. Omitted on the app's own
   *  screens, which move between each other with `BottomNav` instead. */
  navHref?: string;
  /** Its label, including the directional caret. */
  navLabel?: string;
  /**
   * Whether to show the "Sign in" slot.
   *
   * There is nowhere else for it to point yet (no settings screen), so a
   * signed-in visitor sees nothing in its place rather than a link to a
   * destination that doesn't exist. The landing page passes `true` here
   * unconditionally: it is a server component that reads no storage by
   * design, and its own CTA already leads to the screen that offers
   * sign-in.
   */
  signedIn: boolean;
};

/**
 * The pill header shared by capture, journal, and the landing page.
 *
 * Previously three independent inline copies that had already drifted: one
 * written with a literal `rounded-[9999px]`, the others with the token. This
 * is the one place the lockup, the border, and the sign-in slot are defined.
 */
export function AppHeader({ navHref, navLabel, signedIn }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between rounded-[var(--radius-pill)] border-2 border-vast-ink bg-paper-raised px-6 py-3">
      <span className="flex items-center gap-3">
        {/* Full size where the header has only the mark to carry. Beside a
            navigation link, on a phone, the larger wordmark runs into it. */}
        <Logo size={navHref ? 36 : 44} />
        <span
          className={[
            "display-type text-vast-ink",
            navHref ? "text-body-sm sm:text-subheading" : "text-subheading",
          ].join(" ")}
        >
          VaaniTrack
        </span>
      </span>
      <span className="flex items-center gap-4">
        {!signedIn && (
          <Link
            href="/signin"
            className="focus-ring font-figtree text-body-sm text-fog underline underline-offset-4 hover:text-vast-ink"
          >
            Sign in
          </Link>
        )}
        {navHref ? (
          <Link
            href={navHref}
            className="focus-ring font-figtree text-body-sm text-charcoal underline underline-offset-4 hover:text-vast-ink"
          >
            {navLabel}
          </Link>
        ) : null}
      </span>
    </header>
  );
}

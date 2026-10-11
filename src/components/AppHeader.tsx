import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ProfileLink } from "@/components/ProfileLink";

type AppHeaderProps = {
  /** Where the header's one navigation link goes. Omitted on the app's own
   *  screens, which move between each other with `BottomNav` instead. */
  navHref?: string;
  /** Its label, including the directional caret. */
  navLabel?: string;
  /**
   * Show the profile icon, which leads to the You screen. The app's own
   * screens set this; it takes the place of the sign-in link and of the
   * navigation link, which the bottom bar does instead.
   */
  profile?: boolean;
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
  signedIn?: boolean;
};

/**
 * The pill header shared by capture, journal, and the landing page.
 *
 * Previously three independent inline copies that had already drifted: one
 * written with a literal `rounded-[9999px]`, the others with the token. This
 * is the one place the lockup, the border, and the sign-in slot are defined.
 */
export function AppHeader({
  navHref,
  navLabel,
  profile = false,
  signedIn = true,
}: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3 rounded-[var(--radius-pill)] border-2 border-vast-ink bg-paper-raised px-4 py-3 min-[360px]:px-6">
      {/* min-w-0 and the controls' shrink-0: the name gives way, never the thing to press. Under
          340px (a small phone, or a large "display size" setting) the name is dropped and the mark
          carries the header, rather than the two running into each other. */}
      <span className="flex min-w-0 items-center gap-3">
        {/* Full size where the header has only the mark to carry. Beside a
            navigation link, on a phone, the larger wordmark runs into it. */}
        <Logo size={navHref ? 36 : 44} />
        <span
          className={[
            "display-type truncate text-vast-ink max-[339px]:hidden",
            navHref ? "text-body-sm sm:text-subheading" : "text-subheading",
          ].join(" ")}
        >
          VaaniTrack
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-4">
        {profile ? <ProfileLink /> : null}
        {!profile && !signedIn && (
          <Link
            href="/signin"
            // Padded out to a thumb-sized target, and pulled back by the same
            // amount so the header does not grow: 44pt is the size Apple asks
            // for, and the bare text line is under half of it.
            className="focus-ring -my-3 inline-block px-2 py-3 font-figtree text-body-sm text-fog underline underline-offset-4 hover:text-vast-ink"
          >
            Sign in
          </Link>
        )}
        {navHref ? (
          <Link
            href={navHref}
            className="focus-ring -my-3 inline-block whitespace-nowrap px-1 py-3 font-figtree text-body-sm text-charcoal underline underline-offset-4 hover:text-vast-ink"
          >
            {navLabel}
          </Link>
        ) : null}
      </span>
    </header>
  );
}

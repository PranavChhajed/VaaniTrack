import Link from "next/link";
import { Logo } from "@/components/Logo";

/**
 * Shared shell for the auth screens. docs/design/AUTH-ONBOARDING.md §5.
 *
 * The repo's first route group, kept separate from the root layout so
 * capture and journal are untouched by anything built here. `--color-paper`,
 * not one of onboarding's tints: per docs/design/THEME-ONBOARDING.md §2,
 * consent and auth are continuous with the app rather than a pitch for it.
 */
export default function EntryLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-paper px-6 py-8">
      <Link href="/" className="focus-ring -my-1 flex min-h-11 w-fit items-center gap-2">
        <Logo size={32} />
        <span className="display-type text-body-sm text-vast-ink">VaaniTrack</span>
      </Link>
      <div className="flex flex-1 flex-col items-stretch justify-center">
        <div className="mx-auto w-full max-w-[420px]">{children}</div>
      </div>
    </main>
  );
}

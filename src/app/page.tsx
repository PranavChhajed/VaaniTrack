import Link from "next/link";
import { HeroDemo } from "@/components/HeroDemo";
import { Logo } from "@/components/Logo";
import { Reveal } from "@/components/Reveal";
import { LedgerArt, ReceiptArt, SpeechArt } from "@/components/OnboardingArt";

/**
 * The landing page. docs/design/LANDING-PAGE.md.
 *
 * A server component on purpose: it holds no state, reads no storage and
 * renders the same for everyone, so there is nothing here to hydrate. The
 * two client components it mounts, `HeroDemo` and `Reveal`, are self
 * contained islands: everything they wrap still renders fully server-side
 * first, and only gains motion after mount.
 *
 * The product screens live at `/app` and `/journal`, under the (app) route
 * group, which is also where the onboarding and consent overlays mount. That
 * separation is what lets this page exist: mounted at the root they would
 * cover it.
 *
 * Every claim on this page is checked against docs/design/LANDING-PAGE.md
 * §"What this page may not claim". The short version: no percentage may be
 * presented as VaaniTrack's own measured result, nothing about the app is
 * on-device, the 90-day deletion promise is not repeated here while no purge
 * job exists, and an account is never described as doing something it does
 * not do.
 */

const PILLARS = [
  {
    Art: SpeechArt,
    heading: "Say what you spent",
    body: "Speak it the way you'd text yourself.",
  },
  {
    Art: ReceiptArt,
    heading: "Check it before it's saved",
    body: "Every field shows what was heard, worked out, or left blank.",
  },
  {
    Art: LedgerArt,
    heading: "Your money, in your words",
    body: "The journal stays readable, and correctable when it's wrong.",
  },
];

const LIMITS = [
  {
    heading: "No accounts, no sync",
    body: "Your journal lives in this browser. Signing in doesn't move it anywhere yet.",
  },
  {
    heading: "English only",
    body: "One language, for now. Indian English amounts are what it was tuned against.",
  },
  {
    heading: "Early, and deliberately small",
    body: "It does one thing. Everything it doesn't do yet is listed here, not discovered later.",
  },
];

export default function Landing() {
  return (
    <main className="mx-auto flex w-full max-w-[900px] flex-col gap-16 px-5 py-8 sm:gap-24 sm:px-8 sm:py-12">
      <header className="flex items-center justify-between rounded-[var(--radius-pill)] border-2 border-vast-ink bg-paper-raised px-6 py-4">
        <span className="flex items-center gap-3">
          <Logo size={32} />
          <span className="display-type text-body-sm text-vast-ink">
            VaaniTrack
          </span>
        </span>
        <Link
          href="/app"
          className="focus-ring font-figtree text-body-sm text-charcoal underline underline-offset-4 hover:text-vast-ink"
        >
          Open the app &rsaquo;
        </Link>
      </header>

      <section className="rise flex flex-col items-start">
        <span className="flex items-center gap-4">
          <Logo size={72} />
          <span className="display-type text-heading-sm text-vast-ink sm:text-heading">
            VaaniTrack
          </span>
        </span>
        <h1 className="display-type mt-8 max-w-[20ch] text-heading text-vast-ink sm:max-w-[16ch] sm:text-heading-lg">
          Say what you spent.
          <span className="text-fog"> Check it. Done.</span>
        </h1>
        <div className="mt-6">
          <HeroDemo />
        </div>
        <p className="mt-4 max-w-[40ch] font-figtree text-caption italic text-fog">
          It started as a text to self: &ldquo;250 lunch&rdquo;.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-6">
          <Link
            href="/app"
            className="focus-ring inline-block rounded-[var(--radius-pill)] border-2 border-vast-ink bg-mint-whisper px-8 py-4 font-figtree text-body font-medium text-vast-ink active:bg-mint-deep"
          >
            Open the app
          </Link>
          <a
            href="#how"
            className="focus-ring font-figtree text-body-sm text-fog underline underline-offset-4 hover:text-vast-ink"
          >
            See how it works
          </a>
        </div>
        <p className="mt-4 font-figtree text-caption text-fog">
          No account needed.
        </p>
      </section>

      <Reveal>
        <section id="how" className="scroll-mt-8 flex flex-col">
          <h2 className="display-type text-heading-sm text-vast-ink sm:text-heading">
            How it works
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-12 sm:grid-cols-3 sm:gap-8">
            {PILLARS.map(({ Art, heading, body }) => (
              <div key={heading} className="flex flex-col items-start">
                <div className="h-[140px] w-full max-w-[180px] self-center sm:self-start">
                  <Art />
                </div>
                <h3 className="mt-6 font-figtree text-subheading font-bold text-vast-ink">
                  {heading}
                </h3>
                <p className="mt-3 font-figtree text-body-sm text-fog">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* The dark chamber, the app's one inverted surface. Used here for the
          single section carrying a number, so the page's most serious claim
          gets the page's most serious treatment. */}
      <Reveal>
        <section className="rounded-[var(--radius-chamber)] bg-vast-ink px-6 py-10 sm:rounded-[var(--radius-chamber-lg)] sm:px-12 sm:py-14">
          <h2 className="display-type max-w-[20ch] text-heading-sm text-paper sm:text-heading">
            Speech recognition is worst at the part that matters.
          </h2>
          <p className="display-type mt-8 text-heading-lg text-paper">36.3%</p>
          <p className="mt-1 max-w-[40ch] font-figtree text-body-sm text-haze">
            of currency amounts, misheard by off-the-shelf transcription in
            published testing.
          </p>
          <p className="mt-3 font-figtree text-caption text-haze">
            Handling Numeric Expressions in ASR, arXiv:2408.00004. An external
            benchmark of general transcription, not a measurement of VaaniTrack.
          </p>
          <p className="mt-8 max-w-[48ch] font-figtree text-body text-paper">
            So VaaniTrack interprets before it trusts a number. What it
            isn&rsquo;t sure of comes back to you rather than being filed as
            fact.
          </p>
        </section>
      </Reveal>

      <Reveal>
        <section className="flex flex-col items-start">
          <h2 className="display-type text-heading-sm text-vast-ink sm:text-heading">
            What it doesn&rsquo;t do yet
          </h2>
          <p className="mt-6 max-w-[52ch] font-figtree text-body text-charcoal">
            It seems better to say this here than to let you find out later.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {LIMITS.map(({ heading, body }) => (
              <div key={heading} className="border-t-2 border-paper-edge pt-5">
                <h3 className="font-figtree text-body-sm font-semibold text-vast-ink">
                  {heading}
                </h3>
                <p className="mt-2 font-figtree text-body-sm text-fog">{body}</p>
              </div>
            ))}
          </div>
          <Link
            href="/app"
            className="focus-ring mt-10 inline-block rounded-[var(--radius-pill)] border-2 border-vast-ink bg-mint-whisper px-8 py-4 font-figtree text-body font-medium text-vast-ink active:bg-mint-deep"
          >
            Open the app
          </Link>
          <p className="mt-4 font-figtree text-caption text-fog">
            No account needed. Nothing to install.
          </p>
        </section>
      </Reveal>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-paper-edge pt-6">
        <span className="flex items-center gap-2">
          <Logo size={32} />
          <span className="display-type text-body-sm text-fog">VaaniTrack</span>
        </span>
        <span className="flex items-center gap-4">
          <Link
            href="/app"
            className="focus-ring font-figtree text-caption text-fog underline underline-offset-4 hover:text-vast-ink"
          >
            Open the app
          </Link>
          <Link
            href="/signin"
            className="focus-ring font-figtree text-caption text-fog underline underline-offset-4 hover:text-vast-ink"
          >
            Sign in
          </Link>
        </span>
      </footer>
    </main>
  );
}

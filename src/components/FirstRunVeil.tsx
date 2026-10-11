import { Logo } from "@/components/Logo";

/**
 * What a brand-new visitor sees from the first paint until the welcome tour is ready: the tour's
 * own colour, the mark and the name, nothing to tap.
 *
 * Hidden unless LaunchState has marked this launch as a first run (`html[data-first-run]`, see
 * globals.css), so a returning person never meets it. The tour removes the mark the moment it
 * mounts, and sits above this (z-[70] against z-[69]) so there is no frame between the two where
 * the app shows through.
 *
 * A server component with no state of its own, on purpose: it has to be in the HTML.
 */
export function FirstRunVeil() {
  return (
    <div
      id="first-run-veil"
      aria-hidden="true"
      className="fixed inset-0 z-[69] flex-col items-center justify-center gap-4 bg-mint-whisper"
    >
      <Logo size={72} className="veil-in" />
      <span className="display-type veil-in text-heading-sm text-vast-ink" style={{ animationDelay: "120ms" }}>
        VaaniTrack
      </span>
    </div>
  );
}

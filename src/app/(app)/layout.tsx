import { AudioConsentGate } from "@/components/AudioConsent";
import { Onboarding } from "@/components/Onboarding";

/**
 * The shell for the product screens, capture and journal.
 *
 * The two overlays live here rather than in the root layout because they
 * belong to the app, not to the site. Mounted at the root they rendered on
 * every route, which meant a first-time visitor would meet the onboarding
 * carousel thrown over the landing page, and `/signin` could be covered by
 * an overlay it had no way to dismiss. Scoping them to this group is what
 * makes a marketing page at `/` possible at all.
 *
 * Consent is mounted here, not on the capture screen, because the journal
 * records too; asking in one place and not the other would mean a recording
 * could be kept without anyone having agreed to it.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AudioConsentGate />
      {/* First-run flow, above the consent gate (z-[70] > z-[60]). Its own
          last step asks the same consent question, so a genuinely new
          browser only ever sees one of the two overlays at a time, see
          Onboarding.tsx and hasOnboarded()'s existing-device check. */}
      <Onboarding />
    </>
  );
}

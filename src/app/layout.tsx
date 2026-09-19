import type { Metadata, Viewport } from "next";
import { EB_Garamond, Figtree } from "next/font/google";
import { AudioConsentGate } from "@/components/AudioConsent";
import { Onboarding } from "@/components/Onboarding";
import "./globals.css";

const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
  weight: ["400"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "VaaniTrack",
  description: "Say what you spent. Check it. Done.",
};

export const viewport: Viewport = {
  themeColor: "#f0ede7",
  width: "device-width",
  initialScale: 1,
  // Standalone install (manifest.ts) has no browser chrome to fall back
  // on, and this app has no bottom nav either — the header link is the
  // only way between screens. Without this, an iOS notch or home
  // indicator can sit on top of that header instead of beside it.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${ebGaramond.variable} ${figtree.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Mounted here, not on the capture screen: the journal records too,
            and asking in only one place would let a recording be kept that
            nobody agreed to. */}
        <AudioConsentGate />
        {/* First-run flow, above the consent gate (z-[70] > z-[60]). Its own
            last step asks the same consent question, so a genuinely new
            browser only ever sees one of the two overlays at a time — see
            Onboarding.tsx and hasOnboarded()'s existing-device check. */}
        <Onboarding />
      </body>
    </html>
  );
}

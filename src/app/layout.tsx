import type { Metadata, Viewport } from "next";
import { EB_Garamond, Figtree } from "next/font/google";
import { OpenOnCapture } from "@/components/OpenOnCapture";
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
  // on, and this app has no bottom nav either; the header link is the
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
      {/* The consent gate and the first-run flow are deliberately NOT mounted
          here. They belong to the app screens and live in (app)/layout.tsx,
          so that the landing page at `/` is not covered by either. */}
      <body className="min-h-full flex flex-col">
        <OpenOnCapture />
        {children}
      </body>
    </html>
  );
}

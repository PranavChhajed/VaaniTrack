import type { Metadata, Viewport } from "next";
import { EB_Garamond, Figtree } from "next/font/google";
import { AudioConsentGate } from "@/components/AudioConsent";
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
      </body>
    </html>
  );
}

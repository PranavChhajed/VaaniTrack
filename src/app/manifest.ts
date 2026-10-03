import type { MetadataRoute } from "next";

/**
 * The PWA manifest. docs/design/PWA-INSTALL.md.
 *
 * The reason this exists: with no manifest at all, "Add to Home Screen"
 * installs whatever URL happened to be open, reported to have been the
 * journal, not capture. `start_url` is the actual fix; everything else
 * here just makes the resulting install look intentional.
 *
 * It points at `/app`, not `/`, because `/` is the landing page. An
 * install should open the product, not the pitch for it.
 *
 * Caveat that belongs here, not only in the doc: an *already-installed*
 * shortcut keeps its old start URL. This fixes new installs; an existing
 * one has to be removed and reinstalled to pick it up.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VaaniTrack",
    short_name: "VaaniTrack",
    description: "Say what you spent. Check it. Done.",
    start_url: "/app",
    display: "standalone",
    background_color: "#f0ede7" /* --color-paper */,
    theme_color: "#f0ede7" /* matches the viewport export in layout.tsx */,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

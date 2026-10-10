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
 * An *already-installed* shortcut keeps its old start URL, so this only
 * fixes new installs. An existing one pinned to the journal is handled by
 * `OpenOnCapture` instead, which sends a cold open of `/journal` here.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VaaniTrack",
    short_name: "VaaniTrack",
    description: "Say what you spent. Check it. Done.",
    start_url: "/app",
    // Spelled out, and spelled the same as the values the browser already
    // derives from `start_url`, so an app installed before they were written
    // down is still recognised as the same app and not offered as a second one.
    id: "/app",
    scope: "/",
    display: "standalone",
    // Long-press the home-screen icon on Android for a one-tap way in. iOS
    // ignores this list; its route is the Shortcuts app (You > Help).
    shortcuts: [
      {
        name: "Record an expense",
        short_name: "Record",
        description: "Open VaaniTrack and start listening",
        url: "/app?record=1",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
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

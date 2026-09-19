# PWA install — opening on capture

| | |
|---|---|
| **Status** | Planned. Not built |
| **Date** | 18 September 2026 |

---

## 1. The problem

VaaniTrack has no web app manifest, no service worker, and no icon set of its own — `public/` holds five untouched `create-next-app` starter SVGs and nothing else. The only icon in the repo is the default `favicon.ico`.

Because there is no manifest, "Add to Home Screen" installs whatever URL happened to be open at the time — which, going by the report that prompted this doc, was `/journal`. The intended front door is `/` (capture).

This is a known, already-logged gap: `docs/CONTEXT.md`'s "Beyond" section lists *"PWA — manifest + service worker makes it installable (days of work)"* as deferred. This doc scopes the small slice of that actually needed to fix the start screen — not the full PWA.

## 2. What this builds

**`src/app/manifest.ts`** — Next 16's file-convention route, served at `/manifest.webmanifest` and auto-linked from `<head>`. No dependency needed; it's a plain exported object.

```ts
{
  name: "VaaniTrack",
  short_name: "VaaniTrack",
  description: "Say what you spent. Check it. Done.",
  start_url: "/",                // the fix
  display: "standalone",
  background_color: "#f0ede7",   // --color-paper
  theme_color: "#f0ede7",        // matches the existing viewport export
  icons: [ /* see §3 */ ],
}
```

**Icons**, produced from the app's own mark rather than sourced — the four-bar waveform logomark already hand-built in `src/app/page.tsx` (three `vast-ink` bars, one `forest-ink`, on a `paper` ground):

- `src/app/icon.png` — 512×512, Next's file convention, auto-generates the sizes the manifest needs
- `src/app/apple-icon.png` — 180×180, for iOS home-screen
- A maskable variant (safe-zone padding so Android's circular/squircle mask doesn't clip the bars)

**One viewport addition** — `viewportFit: "cover"` on the existing `viewport` export in `src/app/layout.tsx`, so standalone mode handles the iOS safe area correctly. This matters more here than in most apps: **there is no bottom navigation** — the only way between capture and journal is the header link — so nothing else will pull content out from under a notch.

## 3. What this does not build

- **No service worker, no offline support.** Out of scope. A manifest is suf5ficient to fix the start URL; a service worker only becomes necessary if Chrome's install prompt turns out to require one (see caveats).
- **No push notifications, no background sync.**
- **No change to routing.** `start_url: "/"` already points at the existing capture route — nothing about the app's structure needs to move.

## 4. Caveats to state plainly, not discover in testing

- **An already-installed shortcut keeps its old URL.** Shipping the manifest does not fix an existing install. The user has to **remove and reinstall** to pick up the new `start_url`.
- **A manifest alone may not satisfy Chrome's richer install criteria** on every platform — some versions want an active service worker with a fetch handler before showing the install prompt at all. If the prompt doesn't appear after shipping the manifest, the fallback is a minimal no-op service worker purely to satisfy the criteria, not to add offline behaviour.
- **Icon rendering should be checked on a real device**, not just assumed from the PNG — mask clipping on Android is easy to get wrong without a safe-zone margin.

## 5. Acceptance criteria

1. `/manifest.webmanifest` is served and linked from `<head>`.
2. A **fresh** install (not an update of an existing shortcut) opens on `/`.
3. The installed icon shows the waveform mark correctly, uncut, on both iOS and Android.
4. `theme_color` in the manifest matches the existing `viewport` export — no visible seam between the OS chrome and the app canvas on launch.
5. Standalone mode respects the iOS safe area (no content under the notch), verified on a real device given there is no nested layout to catch this in a preview.

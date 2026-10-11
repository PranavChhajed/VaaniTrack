# Fitting every phone, and a first launch that holds together

| | |
|---|---|
| **Status** | Built on branch `polish/responsive`. **Not merged** |
| **Date** | 12 October 2026 |
| **Trigger** | The app was opened on a second phone: the layout was a little off, a new person did not see the welcome tour, the first animation did not play properly, and the app felt slow in places |
| **Method** | Look first. Every screen on twelve phone sizes, the first-run flows, a heavy journal on a slowed CPU, then fix, then look again. Nothing below is a guess about what the other phone did |

## 1. What was looked at

`qa/audit-*.cjs`, run against the production build (`npm run build`, `next start -p 3200`):

| Script | What it does |
|---|---|
| `audit-layout.cjs` | Every screen on 12 sizes (a 280 px folded phone, a 320 px small phone, iPhone SE/14/15 Pro Max, Pixel 5, Galaxy S8/A-series, a 360x520 phone with the browser's bars showing, landscape, tablet, desktop). Reports sideways overflow, text cut off by its box, tap targets under 44 px, console errors. Saves a screenshot of each |
| `audit-states.cjs` | The screens that need a tap to reach (every step of the tour, the review card, an expense's detail, the first-expense guide) on the awkward sizes. Reports any button that starts off-screen |
| `audit-flow.cjs` | A person who has never used the app: straight to `/app`, via the landing page, via sign-up, through the tour, on a slow phone, a returning browser |
| `audit-film.cjs` | A filmstrip of the first seconds of a page load, to see an animation rather than assume it |
| `audit-perf.cjs`, `audit-heavy.cjs`, `audit-profile.cjs` | Page weight and the time to each milestone on a slow connection; a journal of 60 / 1,500 / 4,000 expenses on a CPU slowed 4x; where a CPU profile says the time goes |

## 2. What was found

Nothing scrolled sideways on any size, and the pages are light (about 180 KB of JavaScript, 300 KB in
all). So the "off" layout was not a general failure; it was a handful of specific ones, all on
smaller or shorter screens, plus how the first launch is put together.

| # | Finding | Where |
|---|---|---|
| 1 | **The tour's "Next" button began below the screen** on any phone shorter than about 640 px of usable height (a 320x568 phone, a phone with the browser's bars showing, landscape). The primary action was out of sight until the person scrolled | `Onboarding.tsx` |
| 2 | **A brand-new visitor saw the capture screen, tappable, for as long as the phone took to start the app** (5 s on a slow connection), and the tour then arrived on top of it | `useOnboarded()` is unknown until React has hydrated |
| 3 | The landing demo card was narrower than the screen and changed size at every step, so the buttons below it moved | `HeroDemo.tsx` in a shrink-to-fit parent |
| 4 | At 320 px the landing header's "Open the app" ran over the wordmark; at 280 px the profile icon sat on top of it | `AppHeader.tsx` |
| 5 | The bottom bar's labels collided at 280 px | `BottomNav.tsx` |
| 6 | Tap targets under 44 px: the calendar's month arrows (40), "See earlier days in the journal" (24 px tall), the sign-in logo link (32), footer links (42 wide) | various |
| 7 | The first launch had no entrance: content simply appeared, whenever the scripts got there | |

Not a fault: onboarding **does** appear for a clean browser through every route (straight to
`/app`, via the landing page, via sign-up). A browser that has already minted a device id (any earlier
capture on that phone, or the website opened in the same Chrome the Android app shares) is treated as
returning by design (`hasOnboarded()` in `device.ts`), and still is.

## 3. What was changed

- **The tour is a fixed-height column** (`Onboarding.tsx`): header on top, progress and the one big
  button pinned to the bottom, only the middle scrolls, and the picture is the first thing to give
  way (hidden under 640 px of height). The consent step uses `my-auto` rather than
  `justify-center`, so a column taller than its box scrolls from its top instead of losing it.
- **A launch veil** (`LaunchState.tsx`, `FirstRunVeil.tsx`, `globals.css`): a four-line inline script
  marks `<html data-first-run>` while the page is still being parsed, using the same test as
  `hasOnboarded()`. The app's screens carry a plain mint veil (mark and name) that is shown only
  under that attribute and removed by the tour the moment it mounts. The capture screen is never
  exposed to a first-time visitor. It sits under the tour (`z-[69]` against `z-[70]`), so there is no
  frame between them.
- **An entrance on a cold open only** (`html[data-cold] .enter-children`): the header, the record
  button and the list rise in turn, about a third of a second in all. It is CSS keyed on an attribute
  the same script sets, so it plays on the first paint and not when the scripts arrive, and moving
  between screens stays instant. Switched off by `prefers-reduced-motion`.
- **A stable landing demo**: the card now has a fixed width, so its words changing no longer moves
  anything.
- **Headers and the bar on narrow phones**: the name gives way before the controls do (dropped
  under 340 px, where the mark carries the header), the bottom bar goes icon-only under 300 px
  (names kept for a screen reader), padding tightens under 360 px.
- **Targets**: month arrows 44 px, the journal link and the sign-in logo link 44 px tall, footer links
  wider.
- **Light only, said in the page** (`colorScheme: "light"`): browsers that darken pages before the
  stylesheet is read would otherwise turn the paper-and-ink design inside out.
- **A warm-up when the capture screen opens** (`prewarm.ts`): an `OPTIONS` request to
  `/api/extract` and `/api/transcribe`, at most once a minute and again when the app returns to the
  foreground. A server function idle for a few minutes is stopped, and the first capture after that
  pays to start it; this moves that cost off the person's first words.

## 4. Results

Re-run after the changes, production build, same scripts.

| Check | Before | After |
|---|---|---|
| Tour buttons starting off-screen (6 sizes) | "Next" cut off on 5 of 6 sizes, "No, don't" on 3 | **none** |
| Capture screen visible and tappable to a first-time visitor, slow phone (400 ms, 4x CPU) | **5 s** before the tour covered it | **never** (a veil from the first paint) |
| First-run flows (straight, via landing, via sign-up, used-but-never-toured browser signing up, returning, after the tour) | sign-up on a used browser: no tour | **9 of 9 show the right thing** |
| Header and bottom bar at 280 and 320 px | wordmark overlapped | clean (name dropped under 340 px, bar icon-only under 300 px) |
| Layout/flow audit across 12 sizes | 7 kinds of finding | none left except calendar day cells on a 280 px phone (27 px wide, seven to a row) |
| Regression suites qa1, qa2, qa3, nav on Chromium/iPhone SE and WebKit/iPhone 14, qa4 voice path, qa5 accessibility | | **all pass** (13/13, 19/19, 29/29 after replacing one assertion that encoded the old overlay, 13/13, 0 issues) |
| Warm-up | | one `OPTIONS` to each capture endpoint when the capture screen opens, once a minute at most |

**Speed.** Pages are light (about 180 KB of JavaScript, 300 KB in all; nothing is blocking). On a
mid-range phone's CPU (4x slower) and slow 4G: capture opens in about 1.0 s to first paint, the
journal tab in 0.7 s with 60 entries and 1.0-1.4 s with 1,500. A CPU profile of saving an expense
and of opening the journal found no function worth rewriting: most of the time is the browser
laying out and painting, and the app's own scripts are small. So the waiting a person feels beyond
this is server time, which is the voice pipeline (`VOICE-PIPELINE.md`, on `feature/voice`), not the
screens. The warm-up here removes the cold-start part of it for the first typed or spoken entry.

## 5. Not done, and why

- A service worker (offline opening, instant repeat launches). Pages are static and served from the
  edge, and the scripts are immutable-cached by the browser already, so the gain is mostly offline,
  where capture cannot work anyway until entries can be queued. A feature, not a fix.
- A function region near Groq or the users. Settled in `VOICE-PIPELINE.md`: the function belongs
  where it is.

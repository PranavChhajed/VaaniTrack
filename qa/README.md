# VaaniTrack browser tests

These drive the real app in real browser engines: WebKit (Safari's engine, which
every iPhone browser uses) and Chromium (Chrome's), at phone and desktop sizes.
Every server call is mocked, so nothing here touches the real database, and
every run starts from a clean browser.

## One-time setup

```
cd qa
npm install
npx playwright install webkit chromium
```

## Run

Build and start the app first (the tests expect `http://localhost:3200`):

```
npm run build
npx next start -p 3200
```

Then, from `qa/`:

| Command | What it checks |
|---|---|
| `node qa1.cjs "webkit:iPhone 14"` | typed capture, the review card, Undo, errors, the detail sheet, the journal |
| `node qa2.cjs "webkit:iPhone 14"` | first run and consent, the whole You screen, accounts, shortcut links, offline, blocked storage |
| `node qa3.cjs "webkit:iPhone 14"` | small and sideways screens, large text, keyboard, history, midnight rollover, 3,000 entries, damaged storage, the server's input checks |
| `node qa4.cjs "iPhone 14"` | the voice path with Chrome's fake microphone (Chromium only) |
| `node qa5.cjs "iPhone 14"` | accessibility audit with axe-core over every screen and state |
| `node glass.cjs "webkit:iPhone 14"` | the glass bar: lens position, blur, readability over dark and light |
| `node perf.cjs webkit` | how screen open times grow with the number of entries |
| `./all.sh` | everything, across five engine and size combinations |

The first argument is `engine:profile`, where the profile is a Playwright device
(`iPhone 14`, `iPhone SE`) or `desktop`.

Against a deployed preview instead of localhost, set `BASE`:

```
BASE=https://your-preview.vercel.app node glass.cjs "webkit:iPhone 14"
```

## Android

`cdp.cjs` reads the real state of the app running in an Android emulator over
Chrome's remote-debugging link:

```
adb forward tcp:9222 localabstract:chrome_devtools_remote
node cdp.cjs
```

## Limits

WebKit on Windows has no microphone API, so recording is tested in Chromium and
on the Android emulator. None of this is a real iPhone: it is the same engine,
not the same device. See `docs/design/WIDGET.md`.

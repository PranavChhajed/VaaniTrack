# One-tap record: shortcut, Android widget, iPhone route

The goal: tap something on the home screen and be recording today's expense,
through the same pipeline as everything else.

## What a widget can and cannot be

A web app cannot make a home-screen widget. On both Android and iPhone a widget
is native code, and on both a widget cannot hold the microphone. So the honest
shape is: **the tile opens VaaniTrack already listening.** Everything after the
tap is the website's own capture screen, so the tile cannot drift from the app.

## Layers

| Layer | Who | How |
|---|---|---|
| `/app?record=1` | everyone | The capture screen starts listening by itself. `src/lib/useAutoRecord.ts` |
| Long-press icon shortcut | Android | `shortcuts` in `src/app/manifest.ts` |
| Home-screen tile | Android | The app in `android/` (below) |
| "Start listening when I open the app" | everyone, **the iPhone route** | A setting on You. `useAutoRecord` listens when the app is opened on capture, never when you tap around to it |
| Native tile | iPhone | **Not built.** See "iPhone" |

## `/app?record=1`

- Waits until the first-run tour is finished and the recordings question is
  answered. Recording under an overlay would put the microphone on with nobody
  able to see it.
- Tries **once**. The query is removed from the address before the attempt, so a
  reload or coming back to the tab never records again.
- Logs to today: the capture screen has no `captureDate`, which is the
  extractor's own default.
- Browsers differ on whether a page may open the microphone without a tap. Where
  it may not, the screen says "Tap the button to start speaking" in plain words
  and the tap works. A real refusal (permission blocked, no microphone, an
  insecure page) is not softened: the tap shows the real error.

## Android app (`android/`)

A Trusted Web Activity: the website shown full screen, as an app. It runs in
Chrome, so it **shares storage with the installed PWA and the journal is still
there**. A Capacitor-style shell would have had its own empty storage.

- The widget is `RecordWidgetProvider` (see "The widget" below). Its taps open
  the launcher activity with an address on the site as the intent data.
- The site's half of the link is `public/.well-known/assetlinks.json`, naming the
  app's package and the **public fingerprint** of its signing key. Without it
  Android shows a browser bar instead of full screen.
- The address is a build setting: `-PvaaniUrl=https://...` (default production).
- The signing key (`android/vaanitrack-release.jks`, password in
  `android/keystore.properties`) is **ignored by git and is the app's identity**.
  Lose it and installed copies cannot be updated. Back it up somewhere safe.
- Build: `cd android && ./gradlew assembleRelease` (JDK 17, an Android SDK with
  platform 34). Output: `android/app/build/outputs/apk/release/app-release.apk`.
- Long-pressing the app icon also offers "Record an expense". Android does not
  resolve a string reference inside a shortcut's `data`, so Gradle writes
  `shortcuts.xml` at build time with the real address in it
  (`generateShortcuts` in `app/build.gradle`). The first version used a
  reference and registered with an empty address; the system's own shortcut
  dump (`adb shell dumpsys shortcut`) is what showed it.

### The widget

It drops in as a **2 x 2 tile** (a little bigger than an app icon) and becomes
the **full tile** when it is stretched to about 4 wide. `onAppWidgetOptionsChanged`
picks the layout from the width it has been given (270dp and up is full), so the
two sizes behave the same on every launcher.

| Size | Layout | Tap targets |
|---|---|---|
| compact | `widget_small.xml`: the animated microphone, "Say it / Tap to record" | the whole tile records |
| full | `widget_wide.xml`: the microphone, "Say what you spent", and three buttons | the tile records; **Type** opens `/app?type=1` with the cursor in the box; **Journal** opens `/journal?from=widget`; **Insights** opens `/insights` |

Every target has its own press ripple, and its own `PendingIntent` request code
(or Android hands all four the same intent).

**How it moves.** Android does not run animation code in a widget: the home screen
draws it from a description, and a ViewFlipper cycling through pre-drawn frames is
the one thing that gives a smooth loop. `tools/make_widget_frames.py` draws 12
frames of the app's own record button (a mint disc with five ink bars that breathe
as a wave travels across them, and a ring that swells and fades once per loop);
the flipper shows each for 140ms, so the loop is 1.7 seconds. It only runs while
the widget is on screen.

**What it cannot do.** It cannot listen: Android does not let a widget hold the
microphone, so a tap opens the app, which records. It cannot show your totals:
they are in Chrome's storage for the site, which a native widget cannot read. It
cannot hold a real live waveform for the same reason. Showing today's total on
the tile would need the journal to be somewhere the widget can reach, which means
accounts and sync.

**The site's side.** `/journal` normally sends a cold open to capture (an old
pinned shortcut once pointed there), so the Journal button's address carries
`from=widget`, which `OpenOnCapture` lets through.

### Building the two APKs

```
cd android
./gradlew assembleRelease -PvaaniUrl=https://<the address to open>
```

The address must serve `/.well-known/assetlinks.json` (it is in `public/`, so any
deployment of this repo does). Use the branch preview address to try a build
before release; use the default (production) for the real one. Install with
`adb install -r app/build/outputs/apk/release/app-release.apk`.

## iPhone

**What works:** the app itself, in Safari or from the Home Screen, and the
"Start listening when I open the app" setting on the You screen.

**What was planned and then dropped:** a Shortcuts-app button that opens
`/app?record=1`. On iPhone, Shortcuts' "Open URL" opens **Safari**, never an
installed Home Screen app, and Safari and the Home Screen icon each keep their
own website storage. Expenses recorded through such a button would have landed
in a second, empty journal. The first version of the You > Help text told people
to do exactly that; it was corrected after this was caught. The rule that follows
for iPhone: **keep to one icon.**

**What is not possible without native code:**

- A Home Screen widget tile. iPhone widgets are written in SwiftUI (WidgetKit),
  cannot hold the microphone, and can only open an app.
- An iPhone app that carries the existing journal. A native shell has its own
  storage, so it would start empty until an "import my journal" feature (built on
  the CSV export in `src/lib/exportCsv.ts`) existed.
- Building any of it from Windows. It needs a Mac with Xcode, and a paid Apple
  Developer account (about $99 a year) to run on a phone for more than a week.

**Things that are iPhone's to decide, and not verified here:** whether a page may
open the microphone without a tap (if not, the screen says "Tap the button to
start speaking"), and whether a Home Screen app asks for microphone permission
every time it is launched (it has historically). Both are covered by the fallback.

**Needs iOS 16.4 or newer.** The styling framework the app is built on needs it,
so an older iPhone would show a broken layout.

**Testing without an iPhone:** the app was run in WebKit (Safari's engine, which
every iPhone browser must use) with iPhone 14 and iPhone SE profiles: layout of
every screen, tap targets, text-box zoom, storage across reloads, and every
launch scenario. That is the engine, not iOS: it has no microphone API on
Windows and it is not an iOS audio session or a Home Screen app.

## Verified, and how

On an Android 14 emulator (Google APIs with Chrome), with the APK signed by the
real key and pointed at the branch preview:

- The app opens full screen, with no browser bar, so the asset link verified.
- The tile is offered by the widget picker (3 x 1), can be dropped on the home
  screen, and tapping it opens the app and starts recording with no further tap.
  The first time, Chrome and Android each ask once for the microphone.
- Second use, from a cold start, goes straight to recording with no prompts.
- The long-press shortcut does the same.
- Opening by the app icon does not record.
- A fresh install sees the tour and the recordings question first, and records
  only after them.

## Not verified

- Microphone behaviour on real phones. The emulator's microphone is the host's.
  An iPhone is expected to ask for a tap; the fallback covers it, but it was
  only simulated.
- That the existing journal carries over into the app. It should, because a
  Trusted Web Activity shares Chrome's storage for the site, but the emulator
  had no earlier journal to carry.
- Start-up time on a real phone. The emulator took about 30 seconds to paint
  after a cold start.
- iOS in any form.

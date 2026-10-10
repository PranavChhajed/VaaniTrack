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
| Shortcuts-app button | iPhone | Instructions in You > Help. The Action Button can run it too |
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

- The widget, `RecordWidgetProvider`, is one tile. Its tap opens the launcher
  activity with `https://<site>/app?record=1` as the intent data.
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
- Animations: the tile's look lives in `res/layout/widget_record.xml`; the
  recording-screen animation is web code.

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

Not built, on purpose, for now. It needs a Mac with Xcode and a paid Apple
Developer account, and a native shell has its own empty storage, so the existing
phone-only journal would not appear in it without an import feature. The
Shortcuts route gives iPhone users a one-tap button today without any of that.

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

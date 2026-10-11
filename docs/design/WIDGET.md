# One-tap record: shortcut, Android widget, iPhone route

The goal: tap something on the home screen and record today's expense, through
the same pipeline as everything else.

**Rewritten 11 October.** The first widget only opened the app and was styled
off-brand (a gradient, glass buttons, three extra shortcuts). The widget now
records the expense *on the tile itself*, follows `docs/DESIGN.md` exactly, and
has one control. This file describes the current one.

## What a widget can and cannot be

A web app cannot make a home-screen widget; on Android it is native code. A
widget also cannot hold the microphone itself. So the tile does what a widget
*can* do: a tap starts a small foreground service (`RecordService`) that records,
sends the take to the same `/api/transcribe` the website uses, and tells the
tile how it went. No app window opens.

## Layers

| Layer | Who | How |
|---|---|---|
| `/app?record=1` | everyone | The capture screen starts listening by itself. `src/lib/useAutoRecord.ts` |
| Long-press icon shortcut | Android | `shortcuts` in `src/app/manifest.ts`, and a generated `shortcuts.xml` in the app |
| Home-screen tile that records in place | Android | The app in `android/` (below) |
| "Start listening when I open the app" | everyone, **the iPhone route** | A setting on You. `useAutoRecord` listens when the app is opened on capture, never when you tap around to it |
| Native tile | iPhone | **Not built.** See "iPhone" |

## The tile

One control, however big it is. Paper card, 2px ink border, 32dp corners; the
mint record button; flat colour; no gradient, shadow or glow (`DESIGN.md` §4).
It drops in as 2 × 2 (a little bigger than an app icon) and can be stretched.

### Its states: the web button's, plus what happens after

| State | Picture | Words | Tap does |
|---|---|---|---|
| idle | mint disc, ink bars | "Say what you spent", "Tap, then speak" (or "N waiting for the app") | starts listening |
| warming | ember at 80% | "Getting the mic ready…" | nothing |
| recording | ember, bars moving | "Tap to finish", "Listening" | finishes the take |
| reading | mint, bars sweeping | "Reading it back…", then **what was heard** underneath | nothing |
| logged | forest-ink tick | the amount in **Garamond**, what it was, "Logged ✓", and **Undo** | starts a new take |
| check this | paper, "?" | "Check this", the amount, "Tap to check it" | opens the app's review card |
| failed | paper, red "!" | "Tap to try again" and why, in plain words | tries again |
| not set up | mint | "Connect VaaniTrack" | opens the You screen |

Rules carried over from the design file, and why they matter here:

- **"Tap to finish" appears only once sound is really arriving** (§7). The
  service polls the recorder's level and shows "Getting the mic ready…" until it
  rises above silence (or 1.4 s pass). The same dead-start problem the web button
  guards against applies to a phone's microphone.
- **Ember means the microphone is live, and nothing else** (§2). Reading is mint,
  not ember: nothing is listening then.
- **An unsure result is shown, never saved.** The widget runs the web's own gate
  (`gateFailures` in `src/lib/report.ts`, ported to `CaptureClient.sure`): the
  extractor flagged it, the amount was not *said*, the transcript was shaky
  (mean log-probability below -0.9), or "always let me check" is on. Any of
  those gives "Check this" and nothing is written.
- **Money is Garamond** (§3, the `.money` rule). A text view in a widget cannot
  use a custom font (the launcher draws it in the system font; the first build
  quietly did that), so the amount is drawn into a picture with the app's own EB
  Garamond and tabular figures (`AmountImage.java`). The words around it use the
  system font. A screen reader gets the whole tile as one description.

### How it moves

Android runs no animation code in a widget; a `ViewFlipper` cycling pre-drawn
frames is the one thing that loops. `android/tools/make_widget_frames.py` draws
the two loops (listening: ember bars breathing as a wave travels across them, 12
frames at 75 ms, the web's 900 ms `.wave-bar`; reading: mint bars sweeping) and
the still states. It only moves while recording or reading, which is also the
battery argument for not animating an idle tile. With animations switched off or
battery saver on, the listening picture is still.

## Saving: the inbox

The tile cannot write to the journal: that lives in Chrome's storage for the
site, which native code cannot reach. So a widget capture waits in a small queue
on the phone (`WidgetStore`, in the app's private storage) and is handed to the
website **the next time the app opens**.

- `AppLauncher` (the app's launcher activity) puts the queue on the address it
  opens: `?inbox=<base64url of a JSON list>`.
- `WidgetInbox` (mounted in `(app)/layout.tsx`) reads it on any screen, takes the
  parameter off the address, and puts what is *saved* into the journal and what
  is *to check* on the capture screen as review cards. `src/lib/widgetInbox.ts`.
- Nothing in the address is trusted: each item is rebuilt by the same
  `sanitizeTransaction` the journal uses for damaged storage.
- **There is no acknowledgement back**, so an item is offered on every open until
  it is 14 days old (queue capped at 40), and the website skips ids it has already
  seen. Remembered ids outlive the entry, so deleting an expense does not bring
  it back. An earlier version dropped an item after two hand-overs; a first open
  that failed (offline) would then have lost it.
- A review is remembered only once the capture screen has taken it, so a reload
  in between cannot lose one.
- Until it is collected, the tile says "N waiting for the app". Undo removes the
  last capture from the queue while it is still there.

**What the person sees:** an expense recorded from the tile is in the journal
after they next open the app, not instantly. This is the cost of not having
accounts or sync, and the tile says so.

## Setting it up

The website knows three things the tile needs and cannot read: the phone's
anonymous id, whether recordings may be kept, and the default payment method
(and "always let me check"). On **You → Home-screen widget** (only shown inside
the Android app) the **Connect the widget** button opens
`intent://setup?d=…&c=…&p=…&r=…` which lands in `SetupActivity`. That stores
them, asks once for the microphone (and notification) permission, says what
happened in a toast, and returns to the page. It is refused for anything that is
not a UUID or an unanswered recordings question.

If the settings change afterwards, the You screen says "Your settings have
changed since the widget was connected" and the button reads **Update the
widget**. (`src/lib/shell.ts`: a fingerprint of the four values.)

The Android app is recognised from the first load's referrer
(`android-app://app.vaanitrack.android`), noted once in storage.

## Why a foreground service, and what it costs

A widget tap is allowed to start a foreground service of the microphone type even
when the permission was granted only "while using the app" (verified on Android
14). The cost: Android shows its own microphone indicator and the service's
notification while it listens, and a short notification after ("Logged ₹250")
while the result shows. The service stays in the foreground for those few
seconds because a process with nothing running is frozen within seconds, and a
frozen process cannot put the tile back to idle. Neither indicator can or should
be hidden.

## The Android app (`android/`)

A Trusted Web Activity: the website shown full screen, as an app. It runs in
Chrome, so it **shares storage with the installed PWA and the journal is still
there**.

- `AppLauncher` is the launcher activity (it extends the library's, adding the
  inbox to the address).
- The site's half of the link is `public/.well-known/assetlinks.json`, naming the
  app's package and the **public fingerprint** of its signing key. Without it
  Android shows a browser bar instead of full screen.
- The address is a build setting: `-PvaaniUrl=https://...` (default production).
  `-PvaaniApi=` points only the widget's uploads somewhere else, for testing
  against a stand-in server (it also switches cleartext on for that build only).
- The signing key (`android/vaanitrack-release.jks`, password in
  `android/keystore.properties`) is **ignored by git and is the app's identity**.
  Lose it and installed copies cannot be updated. Back it up somewhere safe.
- Build: `cd android && ./gradlew assembleRelease` (JDK 17, an Android SDK with
  platform 34). Output: `android/app/build/outputs/apk/release/app-release.apk`.
- Long-pressing the app icon offers "Record an expense", which opens the app
  listening. Android does not resolve a string reference inside a shortcut's
  `data`, so Gradle writes `shortcuts.xml` at build time.
- Permissions: internet, **microphone**, **foreground service (microphone)**,
  **notifications**. The app now asks for the microphone, which it did not
  before; it does so only from the widget's set-up.

### Tile details that were learnt the hard way

- Revoking the microphone while the tile still shows its old face would crash the
  service (Android refuses a microphone service without the permission). The
  service checks first and, if it is missing, shows "Set up the widget first".
- A tile that says "Tap to finish" with no service alive is a process that was
  killed. Every redraw checks `RecordService.alive`, and an alarm booked at the
  start of each take and each result redraws it even if the process is gone.
- A tap while it is warming or reading does nothing; two quick taps from idle
  start one take (the second finds it already running).
- Large system text: above 115% the full tile drops its second line.

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
in a second, empty journal. The rule that follows for iPhone: **keep to one
icon.**

**What is not possible without native code:**

- A Home Screen widget tile. iPhone widgets are written in SwiftUI (WidgetKit),
  cannot hold the microphone, and can only open an app. So even a native iPhone
  widget would not record in place the way the Android one does.
- An iPhone app that carries the existing journal. A native shell has its own
  storage, so it would start empty until an "import my journal" feature (built on
  the CSV export in `src/lib/exportCsv.ts`) existed.
- Building any of it from Windows. It needs a Mac with Xcode, and a paid Apple
  Developer account (about $99 a year) to run on a phone for more than a week.

**Needs iOS 16.4 or newer.** The styling framework the app is built on needs it.

## Verified, and how

All on an Android 14 emulator, with a stand-in server (`qa/widget-mock.cjs`)
answering `/api/transcribe`, because the point is the tile, and a real voice and
transcriber are not reproducible. `qa/qa-widget.cjs` drives the real installed
tile by tapping it and reads the one line it logs per redraw. The microphone is
the host's.

It covers: every state in order (and that "Tap to finish" is never shown while
warming); what was sent (the phone's id, the recordings answer, the default
payment, the speaker's date, real mp4 audio, how long, the warm-up time); a
single and a double expense; Undo; an unsure result and a shaky transcript and
"review everything" all held for review and not saved; no amount in what was
heard; the transcriber hearing nothing; the server erroring, answering with
HTML, and dropping the connection; taps while warming, while reading, and a
double tap; the 45-second automatic finish; the app being killed mid-take;
notifications refused; animations off (the picture does not move); 150% system
text; a revoked microphone; a bad set-up link; and an in-place update keeping
the queue.

`qa/qa-handoff.cjs` covers the other half inside the installed app: the You
screen’s Connect and Update buttons, a tile capture reaching the journal once
(and not again on the next open), a deleted entry staying deleted, and an unsure
result arriving as a review card. Android lint is clean; below Android 8 the tile
starts a plain service (a foreground one cannot be started there).

## Not verified

- **Anything on a real phone.** Battery managers on some makes (Xiaomi, Oppo,
  Samsung's "sleeping apps") are known to restrict background microphone use;
  the emulator has none. How the animation feels, and how loud the microphone
  indicator and notification are, need a real handset.
- **The microphone on a real phone's noise floor.** The emulator's is the PC's.
- iOS in any form.

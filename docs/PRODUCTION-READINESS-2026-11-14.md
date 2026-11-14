# Launch, installation and capture verification

Target: Nothing Phone (2), Android 16, Chrome. Physical-device testing was
declined; Android emulator results do not establish Nothing launcher behavior.

## Changes

- Cold launch fades the stable screen once. Hydration-inserted children no
  longer receive staggered translation animations. The old behavior was
  reproduced in Chromium: a late child received `rise` with a 240 ms delay.
- Logo loading uses Next 16's `preload` API instead of deprecated `priority`.
- The Android recording widget displays smoothed microphone volume across
  twelve bar heights. It updates only changed frames, at most every 140 ms;
  recording frames no longer loop independently of sound. Processing remains
  mint. Battery saver and disabled animations retain a still recording image.
- Incomplete NDJSON responses preserve the early transcript for editing,
  including clean EOF before the final result and malformed trailing data.
  No transaction is saved from the early transcript alone.
- Added a read-only, aggregate timing report: run
  `node --env-file=.env.local scripts/capture-baseline.mjs`.

No transaction schema, origin, app identity, signing certificate, model,
confidence threshold or local-storage migration was changed.

## Installation findings

The public manifest has `display: standalone`, `/app` identity/start URL and
root scope. Chromium returned no manifest or installability errors.
The existing production APK's SHA-256 signing certificate matches the public
Digital Asset Links fingerprint. These checks do **not** reproduce or fix the
reported persistent address bar on the user's installations. No speculative
service worker, domain change or data-erasing reinstall was introduced.

Re-run the browser audit with `node qa/install-audit.cjs`. It blocks app API
traffic while reading the deployed page and manifest.

## Measured baseline

Read-only production aggregate, preceding 30 days:

| Stage | Voice median | Voice p95 |
|---|---:|---:|
| Microphone warm-up | 357 ms | 1,204 ms |
| Transcription | 386 ms | 864 ms |
| Extraction | 1,752 ms | 2,850 ms |
| Reported stop-to-result | 3,972 ms | 18,095 ms |

There were 90 voice captures but only 25 reported result timings. Typed
results: 33 captures/timings, median 2,253 ms, p95 3,502 ms. Stage percentiles
come from their available samples and must not be added or subtracted to
estimate network time. Existing telemetry cannot separate widget and web or
measure time through human correction. No latency or recognition improvement
is claimed from this incomplete baseline; model settings remain unchanged.

## Verification

- Production webpack build passed. Default Turbopack hit a local child-process
  failure; the sandboxed build also could not download its Google fonts.
- Launch matrix: 8/8 cases, fresh/returning, normal/throttled, reduced/default
  motion; includes late-content animation, returning navigation and reload.
- Typed transactions: 13/13 tests, 62 checks.
- Onboarding/settings/offline/storage: 19/19 tests, 126 checks.
- Voice and recovery, including the new truncated-response cases: 14/14
  tests, 69 checks. APIs are mocked and microphone input is synthetic.
- Java amplitude tests passed silence, quiet/loud input, attack/release,
  pauses, extreme values and reset.
- Journal data-layer suite: 202 checks passed.
- Web lint: no errors, four pre-existing unused imports in the journal tests.
- Final Android release build and lint passed: no errors, 18 existing warnings.
  The signed version is 1.2.2 (version code 5), with the existing package name,
  certificate and production origin.
- Android 14 emulator, Chrome 157: initial native suite 22/23 passed. A
  screenshot-processing delay exceeded the recording timeout and contaminated
  the following text-scale test. After fixing that test sequencing, both
  animation-disabled and large-text cases passed (2/2 targeted rerun).
  Covered timeout, repeated taps, permission denial, interrupted requests,
  process recovery, review, undo and APK-update queue preservation.
  The text-scale assertion checks crashes only: visual review at 150% shows
  the idle headline ellipsized; saved amount, label and Undo remain readable.
  These results do not establish all launcher sizes or multiple-widget behavior.

The installable artifact is `android/VaaniTrack-1.2.2.apk`, SHA-256
`EA44AD4FA40D5429E5BD7F96DC171203B9CA29E5B5908D073CC95DC73E74AF2F`.
The local-only emulator APK is separate and must not be distributed. Logs are
under `qa/shots/verification/` (ignored by Git). The emulator network bridge
timed out; tests use adb port tunnels and a credential-free local UI server.

## Remaining release gates

The persistent browser bar requires reproduction on the affected installation;
the available configuration checks alone cannot establish its cause. Actual
Nothing Phone launch smoothness, Android 16 widget behavior, and real microphone
response remain unverified. Faster end-to-end capture requires better coverage
of timing and correction outcomes before a candidate optimization can be
accepted. Web deployment and post-deployment verification remain separate
from the local build checks; pushing main may trigger the connected host.

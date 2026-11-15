# Android and PWA quality comparison

This is a targeted audit, not certification that every Android/PWA guideline
is met. Target user device: Nothing Phone (2), Android 16, Chrome. Available
native test device: Android 14 emulator. Nothing launcher issues remain distinct.

## Primary sources and comparison

| Guidance | Project assessment | Action / remaining gate |
|---|---|---|
| [Android core app quality](https://developer.android.com/docs/quality-guidelines/core-app-quality) | Launcher activity is registered; microphone uses a foreground service; transaction data must survive updates | Test package resolution, update, permissions, background and recovery. An emulator does not verify a missing Nothing launcher icon |
| [Widget quality](https://developer.android.com/docs/quality-guidelines/widget-quality) | Resize metadata, descriptions, preview, tap operation and reduced animation exist | Large-text headline can truncate; all launcher grids and Nothing placement still require validation |
| [Widget pinning API](https://developer.android.com/reference/android/appwidget/AppWidgetManager) | Placement is asynchronous; previously repeated setup could issue overlapping requests | Suppress repeated requests for 60 seconds; preserve permission-request state across recreation; ignore unrelated permission callbacks |
| [Android splash screens](https://developer.android.com/develop/ui/views/launch/splash-screen) | Uses adaptive icon and native system launch, then a TWA; no custom delay | Do not add a second splash activity. Native-to-Chrome transition on Nothing remains unmeasured |
| [Trusted Web Activity setup](https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2) | App and site association previously matched release signing certificate | Preserve package, origin and signing. A valid file alone does not prove full-screen runtime verification |
| [PWA installation](https://web.dev/learn/pwa/installation) | Manifest has stable /app identity, root scope, standalone display, icons and shortcut | Browser installation does not contain our native widget. Explain that in You instead of hiding all widget information |
| [PWA offline data](https://web.dev/learn/pwa/offline-data) | Journal uses localStorage; open-page network failures preserve editable input | No service worker means cold offline launch is not supported. Offline shell and an IndexedDB migration need separate data/update tests, not an indiscriminate cache of API responses |
| Installed Next 16 PWA guide (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`) | Native manifest support already used | Retain stable identity and existing data; installability alone is not offline capability |

## Scope and implementation decisions

Use platform guidance to identify specific defects, rather than replacing the
product with a generic template. Keep its visual identity, storage keys, signing
key and origin. No SDK upgrade is claimed: compile/target remain 34; newer target
behavior and distribution-policy requirements are an outstanding release audit.

The pending-pin guard is process-local and time-bounded. It reduces duplicate
requests but cannot guarantee a launcher will never retain a stale placement
window, especially after process death. The app declares no overlay permission
or overlay window code. The user's report of a widget persisting over other apps
after uninstall remains unconfirmed; do not label it fixed.

The setup activity now retains its pending permission state during recreation,
avoids completing twice, and only handles its own permission result. The You
screen explains the APK requirement to browser users and retains the native
connection action for APK users.

## Test environment and disk constraint

New source, reports and test output are under D:/Personal/VaaniTrack. Commands
set TEMP/TMP to qa/shots/tmp, use the existing D: Gradle/npm caches, and read
existing browser/Java installations from C: without installing anything there.
This does not assert control over unrelated Windows or desktop-app writes.

## Verification results

- Next production webpack build and TypeScript passed; changed-page lint passed.
- Installation guidance: browser users see the APK distinction; native users
  retain a valid setup intent. Automated test passed.
- Eight launch cases passed (fresh/returning, normal/throttled, reduced/default motion).
- Chrome installability, manifest identity, scope and standalone display passed.
- Settings/onboarding/offline-recovery/storage suite: 19/19 tests, 126 checks.
- Android release build and lint passed. APK 1.2.3, version code 6.
- Emulator update and fresh installation succeeded; launcher resolves to
  app.vaanitrack.android/.AppLauncher. Invalid and repeated setup did not crash.
- Two rapid valid setup links produced one launcher AddItemActivity, not two.
  Permission recreation is implemented but not fully exercised on a real phone.
- Emulator uninstall initially left widget-service entries during asynchronous
  removal; after 10 seconds there were no VaaniTrack widget or window entries.
  Fresh reinstall succeeded. This does not reproduce the reported persistent
  Nothing overlay, and does not establish that it is fixed.

Artifact: `android/VaaniTrack-1.2.3.apk`, SHA-256
`725D192581AB9C9F995E82583B9E18A0F4254B3E10BF96936DED1CBB024B1778`.
No production transactions were created. Emulator uninstall tests removed only
the synthetic native queue; user phone and browser data were not touched.

Remaining gates: Nothing launcher placement/removal and app-drawer visibility,
native startup frame timing on Android 16, cold offline launch, broader widget
resize/accessibility coverage, and current target-SDK/distribution requirements.
Do not describe this limited audit as meeting every Android/PWA standard.

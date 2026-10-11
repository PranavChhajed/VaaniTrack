# The full test pass, and what it found

Run on 11 October 2026 against the preview build, in Safari's engine (WebKit),
Chrome's engine (Chromium), and the Android app on an emulator. The suites are in
`qa/` (see `qa/README.md`); every server call is mocked, so nothing touches the
real database.

## What is covered

| Suite | Covers |
|---|---|
| `qa1` | typing an expense; sure and unsure results; the review card; Undo; every server failure; the detail sheet (edit, cancel, save, delete); the calendar, day view, and recording onto a past day |
| `qa2` | first run, the recordings question, returning users; the whole You screen (name, payment, review mode, switches, CSV export, both deletes, success and failure); sign-up and sign-in; the shortcut links; offline; blocked storage |
| `qa3` | four small and sideways screen sizes; nine widths; large text; keyboard-only use; Back/Forward; hammering the tabs; reduced motion; a day rolling over at midnight; 3,000 entries; damaged storage; the server's input checks |
| `qa4` | the voice path with a fake microphone: every result and every failure, and that the microphone is released |
| `qa5` | an accessibility audit (axe) of 20 screens and states |
| `qa-android` | the installed app: Back, deep links, `?record=1`, a restart, voice, a revoked microphone, large system text, a 320dp screen, the keyboard, dark mode, requested permissions |
| `qa-widget` | the home-screen tile, recording in place, against a stand-in server: every state, every failure, taps in the wrong order, killed processes, permissions, animations off, large text, an in-place update (23 tests) |
| `nav` | the bottom bar: flat, ink border, the ink pill under the current tab, readable text on both |

Run across five engine and size combinations, the browser suites are about 4,000
checks. Alongside them: 184 unit checks in three time zones, type-check, lint,
the production build, and Android lint.

## Bugs it found, and what was done

| Found | Why it mattered | Fix |
|---|---|---|
| **One damaged record in the saved journal stopped every screen** ("This page couldn't load"). | The only way out was clearing site data, which is the journal. | `sanitizeTransaction`: each record is rebuilt field by field; junk is dropped, duplicates repaired. |
| **On a small phone the recordings question could not be answered.** The overlay was taller than the screen and did not scroll; "No, don't" sat off screen. | That question blocks the whole app. Also hit large text and a phone held sideways. | The first-run and consent overlays scroll, and tighten on short screens. |
| **Save was hidden under the glass bar** for an unsure expense. | The card is taller than the space above the bar. | The card's buttons stick just above the bar. |
| **A screen left open past midnight called yesterday today** (a stale Today list, a "last 7 days" a day behind). | A phone app is left open overnight. | `useToday`: the date ticks over at local midnight and is rechecked whenever the app returns to view. |
| **The journal took as long to open as it was long**: 10 seconds at 3,000 entries in the slow engine. | It would have crept up unnoticed. | Draws the recent ~150 entries first and offers "Show earlier months". Flat from then on. |
| **At large text sizes the You switches and the Insights day labels pushed the page sideways.** | Layout broke for anyone who enlarges text. | Switch rows wrap; day labels shrink to two letters. |
| **The record button's spoken name did not match its words**; the tour's progress bar, the landing demo and the day sheet's Done button were unnamed or misnamed; capture had no heading; calendar cells did not start with what is printed on them. | Voice control and screen readers. | All named from their visible words. Audit: zero issues. |
| `/favicon.ico` returned 404. | A 404 on every visit in Safari. | Added. |

### The widget rebuild (11 October), found by `qa-widget` and by looking at the tile

| Found | Why it mattered | Fix |
|---|---|---|
| **The amount was in the system font, not Garamond.** A text view in a widget ignores a custom font. | `DESIGN.md` makes money Garamond; the amount is what the tile is for. | The amount is drawn into a picture with the app's own font (`AmountImage`). |
| **Revoking the microphone while the tile still showed its old face crashed the app** on the next tap (Android refuses a microphone service without the permission). | A crash from a stale tile, with no explanation. | The service checks the permission first and says "Set up the widget first". |
| **After a result, the tile sometimes stayed on "Logged" or an error indefinitely.** The service ended and Android froze the idle process, so its timer never ran. | A stale "Logged ₹250 Undo" on the home screen. | The service stays in the foreground while the result shows; each redraw of a result books its own expiry redraw. |
| **A tile that said "Tap to finish" after the app was killed.** | Lies about the microphone being on. | Every redraw checks a service is really alive; an alarm redraws it if the process is gone. |
| **Queued expenses were dropped after two hand-overs.** I found this by opening the app twice against a website that did not yet collect them. | A first open that failed (offline) would have lost the expense for good. | Items stay (up to 40, 14 days) and are offered on every open; the website skips ids it has seen. |
| **A review could be lost by a reload** between arriving and being shown. | An unsure result the person never saw. | A review is remembered only once the capture screen has taken it. |
| The Undo button overlapped the tick. | Touching the thing it sat on. | The tick is drawn at 80%. |
| (Earlier round) the tile hid its second line on a tall tile held upright. | Read the landscape height. | Reads the size for the way the phone is held. |

## Looked like bugs, were not

- An expense saved 2 seconds before Chrome is force-killed was lost on reopening.
  Chrome writes site storage a few seconds later, or when the app is paused. After
  Home, then kill, it persists. A person leaving the app does the former.
- Android Back "not leaving the app": a notice appears for a few seconds after a
  launch and takes the first press.
- Five fast widget taps "opened two tasks": one task, one screen; the test counted
  two lines for it.

## Known limits

- The first screen of the app needs a network connection. There is no service
  worker, so it cannot open offline, and every capture needs the server anyway.
- Sideloaded Android apps show Android's "Running in Chrome" notice for a few
  seconds after each launch. It does not appear for apps installed from the Play
  Store.
- Preview links show Vercel's own comment toolbar (a dark circle at the edge).
  The real site does not.
- Not tested on a real iPhone or a real Android phone. See `WIDGET.md`. The widget in particular needs a
  real handset: some makes restrict background microphone use, which an emulator does not.
- The widget suite uses a stand-in for the server, so it proves the tile, not the transcriber.

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
| `qa-android` | the installed app: Back, deep links, `?record=1`, a restart, voice, a revoked microphone, large system text, a 320dp screen, the keyboard, dark mode, five quick widget taps, requested permissions |

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
- Not tested on a real iPhone or a real Android phone. See `WIDGET.md`.

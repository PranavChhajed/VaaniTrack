# The You screen

| | |
|---|---|
| **Status** | Built |
| **Date** | 10 October 2026 |
| **Route** | `/you`, opened from the profile icon in the header |

---

## 1. The idea

Not a settings page. A screen for the person using the app, with one rule for what belongs on it: **a setting earns its place only if it changes what happens the next time an expense is said.** Anything that only adds a decision stays out.

Left out on purpose: profile photo, email and phone (nothing uses them), a category manager, themes, currency and language (each adds a choice without making capture better), streaks and badges (guilt makes people avoid expense apps), a budget limit and reminders (both deferred, see §5).

## 2. What is on it

| Section | Control | Effect |
|---|---|---|
| Your name | Free text, 40 characters | Display only: the profile icon and the page. **Not sent to the extractor.** The extraction prompt is the product and is changed only against measured transcripts; none exist for a name |
| How you pay | UPI, Cash or Card | Filed as the payment method when none is spoken. A spoken one ("paid by UPI") still wins, and is stored as said |
| How careful to be | Save straight away / Always let me check first | The second sends every capture to the review card, however sure the app is. It can only add caution: the existing gate conditions still apply on top |
| Your voice | Keep my recordings (switch), Delete my recordings | The switch replaces the one-time consent answer, which could not be changed before. Delete removes the stored audio files |
| Your data | Export my journal, Delete everything | Export is a `.csv` with every expense and what was said for it. Delete everything is §3 |
| Help | Microphone check, what it doesn't do yet, sign in | Links the existing `/diag/mic` page |

The reasons for each default are in the decisions table of the conversation that produced this; the ones worth keeping:

- **Payment default.** The default used to be a constant. Anyone who mostly pays cash was saying "cash" on every entry.
- **Review mode.** About a third of auto-saved entries had been undone or deleted. Some people want speed and some want control; letting them choose is what makes auto-save trustworthy to the second group.
- **Review-mode rows show no "unsure" banner and open in their reading view.** The app is not unsure; the person asked. The gate records the reason as `review_mode`.

## 3. Delete everything

Removes the journal from this phone **and** from the server. Chosen over "this phone only" because that is what the button says.

- **Server first, phone second.** If the server cannot be reached, nothing is removed and the screen says so. Nobody is left half-deleted without knowing.
- **One transaction on the server.** `capture_events`, `transactions`, then `captures` (which cascades to `capture_transactions`) for the device id, in that order, because an event's link to its capture is "set null on delete" and would orphan rather than remove it.
- **Recordings go first, and the rows only if every file went.** A row is the only thing that knows a file's path.
- **Idempotent.** A repeat after a partial failure finishes the job.
- **A typed confirmation** ("delete"), because it cannot be undone.
- **A fresh start.** Everything under `vaanitrack.` is removed except the onboarding flag, so the tour is not replayed. The device id goes with it, so what is recorded next is not tied to the deleted history. The consent question is asked again. The page then does a full reload so nothing held in memory is written back.
- **What it costs.** The diagnostic history for that device is gone. The speed and accuracy analysis in `SPEED-ACCURACY.md` was only possible because that data existed.

`POST /api/erase` takes `{ deviceId, scope: "recordings" | "everything" }`. Authority is knowing the device id, an unguessable UUID that only the browser holds and that travels only over HTTPS. There is no account to check it against, so this is as strong as the rest of the app until real sign-in exists. Unlike `/api/observe` it answers truthfully, because someone is waiting on the answer.

## 4. How it is stored

On the phone, under `vaanitrack.settings`. `lib/localStore.ts` is a small subscribable wrapper over `localStorage`, read with `useSyncExternalStore`. That replaced the pattern of reading storage in an effect and copying it into state, which rendered one frame of the wrong thing and was the cause of all six lint errors the project carried.

If storage refuses a write (private mode), values are held in memory for the session, so the app behaves as it always did without storage: it works, and forgets on reload.

### A bug this fixed

`saveTransactions` refused to overwrite a non-empty journal with an empty one, as a backstop against a hydration race. The race was already gone, and the guard's only effect was that **deleting your last remaining entry never persisted**: it came back on reload. The journal now lives in storage rather than in a copy of it, every change reads the current journal first, and the guard is removed.

## 5. Not built, and why

| Not built | Reason |
|---|---|
| Monthly budget, salary day | Keeps the app a record, not a judge. Revisit once the basics feel right |
| Daily reminder | Needs push notifications, which the app has no groundwork for. Its own piece of work |
| Real accounts and sync | A much larger project: authentication, moving existing data, privacy rules. Sign-in stays a stub |
| Restore from server | The server holds a copy, but there is no way to bring it back to a phone. Export is the way to keep a copy |

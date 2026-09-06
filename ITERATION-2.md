# Iteration 2 — Day 2

**Date:** 2026-09-05
**Depends on:** `ITERATION-1.md` (done), `PRD-VaaniTrack.md` v0.3
**Budget:** 1 day
**Goal:** the demo survives contact with a real phone and a real audience

---

## Where things stand

The core loop works. Verified end to end with real speech audio, 5/5, and the
server log shows six successful capture round trips from the phone:

    POST /api/transcribe 200  ->  POST /api/extract 200

So the microphone opens, audio uploads, transcription and extraction both
succeed. What is *not* confirmed is what happens on screen afterwards, which is
the first task below.

**Built:** capture → transcribe → extract → review → save → ledger, with
per-field provenance, multi-expense, intra-utterance correction, ambiguity
flagging, hallucination rejection, and the currency-artifact fix.

**Not built:** cross-turn correction, settings, accounts, sync, multilingual.

---

## Task 1 — Close the loop on the phone

**Blocked on a real device test.** The suspicion is that the review card renders
below the fold: on a phone the hero fills the screen, so a card appearing under
it is invisible and the app looks inert even though every request succeeded.

Already done in anticipation:
- The review section scrolls into view the moment a card exists.
- Server-side logging of transcript and extraction result, so a failure is
  diagnosable from the terminal rather than by guesswork.
- A diagnostic line under the button reporting bytes, mime type, duration, and
  what was heard.

**Next:** one capture on the phone, then read the log. Everything below assumes
this clears.

---

## Task 2 — Text fallback  ← do this before any polish

A text field beside the mic that runs the same extraction, skipping only
transcription.

**Why it ranks this high:** right now a microphone failure is a total demo
failure. Bad room noise, a denied permission, a browser that misbehaves on the
day — any of them and there is nothing to show. A text input makes the product
demonstrable regardless, and it costs very little because `/api/extract`
already takes text and is the stage that carries the actual product thinking.

It is also honest to the original insight. The source document's own example of
existing behaviour was *typing* `250 lunch` into WhatsApp. Supporting typed
input is not a compromise; it is the behaviour the product was modelled on.

---

## Task 3 — Edit and undo on saved entries

The ledger currently only deletes. Two gaps:

- **Edit a saved transaction.** Review-before-save catches errors at capture,
  but nothing catches an error noticed later.
- **Undo after save.** A brief "saved · undo" affordance. Cheap, and it removes
  the only irreversible action in the product.

Both follow directly from Principle 0. A product whose promise is *never record
a wrong transaction* should not make a wrong record hard to correct.

---

## Task 4 — States and edges

| State | Current | Needed |
|---|---|---|
| Processing | "Reading it back…" on the button | fine |
| Mic denied | explicit message | fine |
| No speech heard | explicit message | fine |
| Rate limited | explicit message | fine |
| No amount in utterance | error message | offer to open the card in edit mode instead of discarding |
| Empty ledger | one line of copy | fine |
| Offline | generic failure | name it as a network problem |
| Long transcript | untested | truncate on the card |

---

## Task 5 — Accuracy pass

`ITERATION-1.md` planned a benchmark that was compressed away when the deadline
became two days. Now that the pipeline works, run a smaller version: **20–30
real utterances spoken into the phone**, in a normal room, and record the amount
accuracy.

This matters because every accuracy number so far comes from Windows SAPI
speech, which is unnaturally clean — no accent, no room, no hesitation. It tells
us the plumbing works. It says nothing about R9 in real conditions.

Log the result against the §4.4 bar: **≥95% amount, ≥80% whole transaction**.

---

## Order, and why

1. **Phone confirmation** — everything else is speculative until this clears
2. **Text fallback** — removes the single point of failure in the demo
3. **Edit + undo** — closes the correctness loop after save
4. **States and edges** — polish, once the substance holds
5. **Accuracy pass** — needs the rest working, and informs what to say about it

If time runs short, 1 and 2 are the ones that matter. 3 is a half hour. 4 and 5
are genuinely optional for a demo.

---

## Explicitly still out

Unchanged from `ITERATION-1.md`: cross-turn correction (FR-6), settings UI,
accounts, sync, database, multilingual, categories management, analytics.

Cross-turn correction remains the most interesting thing not built, and remains
the right thing to cut — it needs conversation state and it degrades badly when
rushed, which Principle 0 will not tolerate.

---

## Risks going into day 2

| # | Risk | Mitigation |
|---|---|---|
| 1 | Phone capture still fails for a reason not yet identified | Logging and on-screen diagnostics are now in place; the next attempt produces evidence rather than a guess |
| 2 | Real-world amount accuracy is worse than the SAPI tests suggest | Review-before-save absorbs it; Task 5 measures it honestly |
| 3 | Groq free-tier rate limits during a live demo | Prompt already halved; consider warming a couple of captures beforehand |
| 4 | The tunnel URL changes every restart | Regenerate the QR; it is printed automatically |

---

## Superseded in part by Iteration 3

See `ITERATION-3.md` — the Transaction Journal, from
`transaction-journal-product-document.md`.

- **Task 3 (edit + undo)** moves there as Iteration 3 Task 4, where a real
  transaction detail screen replaces the inline edit sketched here.
- **Task 4 (states and edges)** splits: empty states move to Iteration 3 Task 7;
  offline messaging and long-transcript truncation stay open here.
- **Task 5 (accuracy pass)** is unaffected and stays here. It measures capture,
  not the journal.

Tasks 1 and 2 are done. Task 1 cleared on 2026-09-06 with confirmed voice
capture from the phone; see `EXECUTION.md` for the real-device corpus.

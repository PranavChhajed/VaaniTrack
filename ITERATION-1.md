# Iteration 1 — 48-hour build

**Date:** 2026-09-05
**Depends on:** `PRD-VaaniTrack.md` v0.3, `RESEARCH.md`
**Budget:** 2 days
**Goal:** a working demo of speak → understand → review → record

> **Supersedes** the 7-day benchmark plan previously in this file. That plan assumed silent recording, where amount accuracy had to be proven before anything was built. FR-12 (review before save) removes that dependency — the user sees every transaction before it commits, so the review card absorbs whatever accuracy the pipeline has. The benchmark survives only as a 2-hour spike, and only so you know what you're demoing.

---

## Decisions locked

| | |
|---|---|
| **Platform** | Next.js web, responsive, works in a phone browser (`MediaRecorder`) |
| **Transcription** | Groq — `whisper-large-v3`. Free tier, and the accent-capable model. |
| **Extraction** | Groq LLM. One API key covers both stages. |
| **State** | localStorage. No auth, no database, no sync. |
| **Intent** | Demo. Optimise for the visible loop. |

---

## Scope

### In

| FR | What | Note |
|---|---|---|
| FR-1 | Natural utterance capture | "250 lunch", "I spent 700 on lunch" |
| FR-2 | Field inference | LLM fills what wasn't said |
| FR-3 | Defaults | **Hard-coded** — UPI, today. No settings screen. |
| FR-4 | Explicit overrides default | "300 lunch, paid in cash" |
| FR-9 | Never fabricate | Missing stays missing. No invented time. |
| FR-10 | Provenance | Shown simply: said / inferred / default |
| **FR-12** | **Review before save** | **The spine of the demo.** |
| FR-5 | Multi-expense | *If free* — the LLM likely handles it with no extra work |

### Out — and why

| FR | Cut | Reason |
|---|---|---|
| **FR-6** | Conversational correction | The hardest thing in the spec. A full day on its own, and the most brittle. **Review-before-save already gives correction** — the user edits on the card. Voice correction is v2. |
| FR-7 | Ambiguous-correction clarification | Depends on FR-6 |
| FR-8 | Minimal clarification UI | Simplified: unclear fields arrive blank on the card rather than triggering a question |
| FR-11 | Per-field confidence policy | The review card approximates it. Real confidence scoring is post-demo. |
| — | Settings, accounts, categories management, history filtering, analytics | Not the demo |

**The cut that costs most is FR-6.** It's the differentiator. It is also the one that turns a 2-day build into a 4-day build, and it degrades badly when rushed — a correction feature that misfires is worse than no correction feature, given Principle 0.

---

## The loop being built

```
   ┌──────────┐
   │  🎤 tap  │  hold or tap to record
   └────┬─────┘
        │  audio blob
        ▼
   ┌─────────────────────────┐
   │ Groq whisper-large-v3   │
   └────┬────────────────────┘
        │  "two fifty lunch"
        ▼
   ┌─────────────────────────┐
   │ Groq LLM → structured   │  amount, description, category,
   │ + provenance per field  │  payment, date + where each came from
   └────┬────────────────────┘
        ▼
   ┌────────────────────────────┐
   │  ₹250 · lunch              │  ← FR-12
   │  food · UPI · today        │     said / inferred / default
   │  [ Edit ]        [ Save ]  │     visually distinguished
   └────┬───────────────────────┘
        ▼
   transaction list (localStorage)
```

---

## Sequence

### Day 1

| Block | Work |
|---|---|
| **Spike (~2h)** | Record ~20 utterances yourself. Run through Groq whisper → LLM extraction. **Look at the amount accuracy.** Not a gate — you just need to know what you're demoing, and it tells you how hard the review card has to work. |
| **Scaffold** | Next.js app, Groq client, `/api/transcribe` and `/api/extract` routes |
| **Capture** | `MediaRecorder`, permission handling, record → blob → transcribe. Get text on screen. |
| **Extract** | Prompt for structured output with per-field provenance. This prompt is the product — expect to iterate on it more than on any code. |

**End of day 1:** speak into the browser, get a correct structured transaction printed to the page. Ugly is fine.

### Day 2

| Block | Work |
|---|---|
| **Review card** | FR-12. The one screen that matters. Awaits your theme. |
| **Edit + Save** | Inline correction on the card, commit to localStorage |
| **List** | Transactions, newest first |
| **Polish** | Recording states, errors, empty state, phone layout |
| **Multi-expense** | If the LLM already returns arrays, render them as separate cards |

**End of day 2:** the demo.

---

## Where the risk actually is

1. **The extraction prompt, not the code.** Getting the LLM to return clean structured output *with provenance*, leave category blank rather than guess, and never invent a time — that's prompt iteration, and it's where the hours go. Budget for it.
2. **Amounts.** R9 stands: 36.3% baseline on currency. The spike tells you how bad it is. If it's rough, the review card's amount field needs to be the most prominent thing on screen.
3. **Mobile browser mic permissions.** `MediaRecorder` on iOS Safari has quirks. Test on a real phone early, not at 11pm on day 2.

---

## What the demo proves

- That "250 lunch" becomes a correct transaction without a form
- That the system says what it inferred rather than pretending it knew
- That a wrong parse is caught before it becomes a record
- That capture is faster than a form even *with* the review tap

## What it does not prove

- Retention (H2) — needs weeks, not days
- That voice beats auto-import (Decision 1, still open)
- Accuracy at the §4.4 bar — the spike is 20 utterances, not 150

---

## Blocked on

**The UI theme.** Requested from the product owner. The review card is the whole experience and it should be built to a real direction rather than to defaults — `frontend-design` is explicit that templated choices are the failure mode here.

The pipeline work (spike, scaffold, capture, extract) is theme-independent and can start immediately.

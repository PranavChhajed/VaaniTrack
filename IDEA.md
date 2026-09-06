# VaaniTrack — Idea Understanding

**Source:** `Product Idea Context for Claude.md`
**Status:** Pre-PRD comprehension document
**Date:** 2026-09-05

This document records what the idea *is*, separated by epistemic status. Nothing here is invented. Where the source is silent or contradictory, that is stated rather than filled in.

---

## 1. The Idea in One Paragraph

A voice-first expense capture product. The user speaks a short, natural utterance — "250 lunch" — and the system converts it into a structured financial transaction, inferring the fields the user did not say from context and configured defaults. The product is scoped narrowly to *capture*, not to personal finance management. The bet is that friction at the moment of recording is why people abandon expense tracking, and that removing that friction makes the habit survivable.

---

## 2. Epistemic Ledger

### FACT (stated as observed reality in the source)

| # | Statement |
|---|---|
| F1 | Many expense tracking and money management applications already exist. The problem is not absence of tooling. |
| F2 | Voice-based expense tracking is not a new concept. Kharcha Bolo and other voice expense trackers exist. |
| F3 | A friend of the author used Kharcha Bolo, found the core app fairly good — particularly its WhatsApp functionality — but hit issues with WhatsApp voice-message recognition/transcription. |
| F4 | The author's own workaround is sending himself a WhatsApp message such as "250 lunch". |

### USER OBSERVATION (behaviour seen, not yet generalised)

| # | Statement |
|---|---|
| O1 | People express spending in a compressed, conversational form — "250 lunch" — not in field-by-field form ("Amount = 250, Category = food…"). |
| O2 | The author records expenses via self-messaging rather than a dedicated tracker. |
| O3 | Short-message expense capture is a behaviour the author has observed in himself and in people around him. Sample size and rigour are not stated. |

### DECISION (explicit choices to preserve)

| # | Decision |
|---|---|
| D1 | The initial product is **expense capture through voice**. Nothing broader. |
| D2 | The core interaction model is **Speak → Understand → Record**. |
| D3 | Success is measured as **successful transaction capture**, not transcription accuracy. |
| D4 | Some transaction fields are user-configurable **defaults** (e.g. default payment method = UPI). |
| D5 | **Explicit user information overrides defaults.** "300 lunch, paid in cash" records cash. |
| D6 | The system **infers aggressively when confidence is high**; it asks only when the missing information materially affects the transaction. |
| D7 | Clarification asks for the **minimum** missing information, via low-friction choices (e.g. `[Lunch] [Coffee]`), not free text. |
| D8 | Multiple expenses in one utterance become **separate transactions**. No "expense group" abstraction. |
| D9 | Conversational correction is in scope — the system must understand correction intent **semantically**, not via a hard-coded keyword list. |
| D10 | Ambiguous corrections are resolved by asking, not by silent guessing. |
| D11 | The system must **never fabricate** financial information. Unknown stays unknown. |
| D12 | The system distinguishes four provenance classes per field: explicitly provided / inferred with high confidence / supplied by default / unknown. |
| D13 | **English only** in the first version. Indian languages and Hinglish are deferred. |
| D14 | The data model should emerge from requirements, not be over-specified up front. |
| D15 | Layer 1 (assets) and Layer 3 (debts/splitting) are out of scope. Only Layer 2 (spending) is in scope. |

### Explicit Non-Goals (D16 — enumerated in the source)

investment tracking · stock portfolio management · wealth management · budgeting systems · financial dashboards · advanced analytics · debt management · lending/borrowing · Splitwise-style settlement · broad financial aggregation · multilingual support v1 · complicated expense grouping

### ASSUMPTION (believed, not established)

| # | Assumption |
|---|---|
| A1 | Users have a pre-existing mental model for lightweight expense capture, so they will not need to learn a vocabulary. |
| A2 | A default payment method is stable enough per user that it usefully removes a field from most utterances. |
| A3 | Timestamps appearing close together in transaction history adequately communicate that expenses were spoken together — no grouping needed. |
| A4 | Speaking is faster than filling a form for the user, in real conditions. |
| A5 | The four correction/provenance behaviours are achievable well enough to feel natural rather than brittle. |

### HYPOTHESIS (the things the product exists to test)

| # | Hypothesis |
|---|---|
| H1 | **Core:** People abandon expense tracking because logging individual transactions creates too much friction. |
| H2 | **Stronger form:** People *want* to record spending; existing recording interactions have enough friction that they stop. If capture becomes fast and natural enough, the habit becomes maintainable. |
| H3 | A voice-first interface reduces that friction *enough* to change the outcome. |

### UNKNOWN (open, must not be silently resolved)

| # | Unknown |
|---|---|
| U1 | The target user segment. Explicitly not locked. Not assumed to be students or engineers. |
| U2 | The competitive differentiation. Explicitly unresolved — "voice input exists" is judged insufficient. |
| U3 | Whether input friction is *the primary* reason people abandon tracking. |
| U4 | Whether voice materially improves retention. |
| U5 | Whether users prefer voice over manual entry. |
| U6 | Whether users will trust an AI to interpret financial transactions. |
| U7 | Whether natural speech can be interpreted accurately enough. |
| U8 | How often clarification will actually be required. |
| U9 | Real-world performance under background noise. |
| U10 | Whether users will switch from existing solutions. |
| U11 | Whether voice capture alone is valuable enough to be a standalone product. |
| U12 | What "successful capture" means numerically — no target rate is stated anywhere. |

### RISK

| # | Risk |
|---|---|
| R1 | **Competing against "doing nothing."** The real incumbent is self-messaging on WhatsApp, a note app, or memory. That workaround has near-zero friction and zero install cost. A dedicated app must beat it, not just beat other apps. |
| R2 | **Differentiation risk.** Voice expense tracking is an occupied category (F2). Without a resolved answer to U2, the product is a feature, not a product. |
| R3 | **Financial trust risk.** Silent misinterpretation is worse than failure. A wrong amount recorded confidently damages trust more than a clarification prompt would. |
| R4 | **Inference/clarification tension.** D6 (infer aggressively, don't ask) and D11 (never fabricate) pull in opposite directions on every low-confidence field. The threshold between them is undefined. |
| R5 | **ASR quality is the known failure point of the nearest competitor** (F3). If VaaniTrack's recognition is not materially better, it inherits the same failure. |
| R6 | **Correction scope creep.** Semantic correction over an open-ended conversation history is substantially harder than single-utterance parsing, and it is a v1 requirement (D9, D10). |

---

## 3. Contradictions and Tensions Identified

1. **Infer aggressively vs. never fabricate.** D6 asks the system to fill gaps confidently; D11 forbids inventing financial data. Both are correct in spirit, but no confidence threshold, and no rule for which fields may be inferred vs. which must stay unknown, is given. *This must be decided before build.*

2. **"Time" is in the transaction model but sometimes unknowable.** §12 lists `time` as a field; §11 says the system must not fabricate an exact transaction time when none was provided ("I spent ₹400 on lunch yesterday"). So `time` must be nullable, or must carry provenance. The source does not say which.

3. **English-only vs. Indian accents.** D13 scopes v1 to English, while §14 lists Indian accents, speaking speed, noise and imperfect pronunciation as challenges to address "after the core experience is robust." But the initial users are, by implication, Indian (₹, UPI, chai, Rahul, Kharcha Bolo). English-with-Indian-accent is therefore a *v1* condition, not a later one. The source treats it as deferred; that appears to be a mis-sequencing.

4. **"Paid 500 to Rahul" is listed as an in-scope utterance** (§5) but person-to-person payment sits adjacent to Layer 3 (lending/borrowing), which is explicitly out of scope (D15). Whether this is a plain expense with a person as description, or the thin end of settlement tracking, is undefined.

5. **No success metric is quantified.** D3 names the right metric — successful capture without manual correction or unnecessary clarification — but no target value exists (U12). The PRD can state the metric; it cannot state the bar.

---

## 4. The Interaction Model, Distilled

```
                 ┌─────────────────────────────────────────┐
   user speaks   │  "300 lunch and 150 coffee"             │
                 └────────────────┬────────────────────────┘
                                  ▼
                    ┌──────────────────────────┐
                    │  understand financial    │   ← not transcription
                    │  intent                  │
                    └────────────┬─────────────┘
                                 ▼
              ┌──────────────────────────────────────┐
              │  fill fields from, in priority order:│
              │   1. what the user explicitly said   │
              │   2. high-confidence inference       │
              │   3. user defaults                   │
              │   4. leave unknown  ← never invent   │
              └──────────────┬───────────────────────┘
                             ▼
                 ┌───────────────────────┐
      confident? │ yes → record silently │
                 │ no  → ask ONE minimal │  [Lunch] [Coffee]
                 │       question        │
                 └───────────┬───────────┘
                             ▼
                 ┌─────────────────────────────────┐
                 │  transactions recorded          │
                 │  ₹300 lunch  ·  ₹150 coffee     │
                 └───────────┬─────────────────────┘
                             ▼
      user says  │ "Actually, the coffee was 180"  │
                 ▼
              update existing transaction — do not create a new one
```

---

## 5. Worked Examples from the Source

| Utterance | Expected outcome | Notes |
|---|---|---|
| "250 lunch" | ₹250 · lunch · food · default payment · today | No clarification should occur |
| "120 chai" | ₹120 · chai · food/beverage · UPI (default) · today | Default fills payment method |
| "300 lunch, paid in cash" | ₹300 · lunch · **cash** | Explicit overrides default (D5) |
| "I spent 300 on lunch, 150 on coffee, and 80 on a snack" | Three separate transactions | No grouping (D8) |
| "Uh, spent like 250… no, wait, 280 on lunch" | One transaction, ₹280 | Intra-utterance self-correction (D9) |
| "300 lunch and 150 coffee" → "Actually, the coffee was 180" | Coffee updated 150 → 180 | Cross-turn correction (D9) |
| "300 lunch and 150 coffee" → "Actually, make that 180" | Ask: `[Lunch] [Coffee]` | Ambiguous target (D10) |
| "I spent ₹400 on lunch yesterday" | ₹400 · lunch · date=yesterday · time=**unknown** | Do not fabricate time (D11) |
| "Paid 500 to Rahul" | Listed as in-scope; semantics undefined | See Contradiction #4 |

---

## 6. Transaction Model as Currently Imagined

Minimum fields named in §12 — explicitly **not** final (D14):

`id` · `amount` · `description` · `category` · `payment_method` · `date` · `time` · `created_at` · `source`

Additional metadata for conversational context and corrections is anticipated but unspecified. The source warns against adding fields merely because expense apps conventionally have them.

Implied by D12 but not yet in the model: **per-field provenance** (explicit / inferred / default / unknown). This is a requirement of the product philosophy and has no home in the field list above.

---

## 7. What This Product Is Competing Against

Not only other expense apps. Per §16, also:

- doing nothing
- remembering later
- messaging yourself
- keeping a personal note

This reframes the bar. The comparison is not "better than Walnut/Money Manager" but "worth more than the zero-effort thing I already do."

---

## 8. Decisions Still Needed Before Build

Carried forward into the PRD. Not resolved here.

1. What confidence threshold separates "infer" from "ask"?
2. Which fields may be inferred, and which must remain unknown when unstated?
3. Is `time` nullable, or does every transaction carry a provenance marker?
4. What is the target user segment? (U1)
5. What is the differentiation vs. Kharcha Bolo and similar? (U2)
6. What is the numeric bar for "successful capture"? (U12)
7. Is "Paid 500 to Rahul" an expense, or the start of Layer 3?
8. Is Indian-accented English a v1 requirement or a v2 one? (see Contradiction #3)
9. How far back does correction context reach — the last utterance, the session, the day?
10. What is the delivery surface — app, WhatsApp, both? The source discusses WhatsApp as both the incumbent behaviour *and* a competitor's strength, but never states which surface VaaniTrack ships on.

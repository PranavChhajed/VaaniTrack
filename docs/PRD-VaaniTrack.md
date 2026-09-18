# PRD — VaaniTrack

**Voice-first expense capture**

| | |
|---|---|
| **Version** | 0.3 — pre-build |
| **Date** | 2026-09-05 |
| **Status** | **Superseded as a description of the system.** Preserved as the pre-build record — see the banner below. |
| **Sources** | `Product Idea Context for Claude.md`, `IDEA.md`, `RESEARCH.md` |
| **Changes in 0.2** | Six open decisions resolved by the product owner. Research findings incorporated. |
| **Changes in 0.3** | Amount confirmation, segment, success bar, correction window, accent requirement and v1 scope resolved. Market positioning deliberately left open — it does not block the build. |

> ## 📋 Pre-build record — not the as-built specification
>
> **Status as of 18 September 2026.** This PRD was written on 5 September, before any code existed, and was never revised afterwards. It is preserved as the record of what was intended. **For what VaaniTrack actually is and does, read `CONTEXT.md`.**
>
> **What was built but is not described here at all.** Roughly half the shipped application post-dates this document and appears nowhere in it: the **transaction journal** (browsing, editing and correcting history), the **observability layer** (Supabase Postgres recording every pipeline stage), the **diagnostic portal** at `/portal`, the **audio-consent gate**, and the **microphone signal guards**. There is no FR for any of them. See `CONTEXT.md` §12, §14 and §15.
>
> **What is specified here but was never built.** FR-6, FR-7 and FR-8 — conversational correction, ambiguous-correction handling, and the tappable clarification UI — were cut during the build and do not exist. §11's "what v1 must contain" still lists them as mandatory; it is wrong. Correction happens by editing fields on a card, which is precisely the interaction §6 set out to avoid. Note that self-correction *within a single utterance* ("250, no wait, 280 on lunch") does work — it came for free from the extraction prompt — but correcting a *previous* capture by speaking does not.
>
> **One claim here is now inverted, and it is the important one.** §13 argues the accent requirement is free because Whisper can be self-hosted with **"no audio leaving the machine."** The shipped app does the opposite: audio is posted to a hosted transcription API, and with the user's consent it is also uploaded to Supabase Storage and retained for 90 days. Anyone reading this PRD for the product's privacy posture will get it exactly backwards. `CONTEXT.md` §14 describes what actually happens.

> **How to read this document.** Every substantive statement carries a tag:
> **[FACT]** observed reality · **[OBSERVATION]** behaviour seen, not yet generalised · **[DECISION]** an explicit choice to preserve · **[ASSUMPTION]** believed but unproven · **[HYPOTHESIS]** the thing we are testing · **[UNKNOWN]** deliberately unresolved · **[RISK]** what could go wrong.
>
> Untagged text is connective explanation. No decision has been made on the author's behalf. Where the source was silent, this document says so instead of filling the gap.

---

## 1. Summary

VaaniTrack lets a person record an expense by saying it out loud in whatever words come naturally — "250 lunch" — and turns that into a properly structured transaction, filling in the fields they did not say. The product is deliberately narrow: it captures spending and nothing else. It exists to test one belief — that people stop tracking expenses because recording each one takes too much effort, and that removing that effort keeps the habit alive.

---

## 2. Contacts

| Name | Role | Comment |
|---|---|---|
| Pranav | Product owner, originator | Author of the source idea document. Holds all open decisions. |
| *unassigned* | Engineering lead | — |
| *unassigned* | Design | Clarification UI and capture affordance are design-critical (see 7.3). |

**[UNKNOWN]** Team composition is not stated in the source.

---

## 3. Background

### 3.1 The problem

**[FACT]** There is no shortage of expense tracking apps. People are not blocked by a lack of tools.

**[OBSERVATION]** People stop tracking their expenses because recording each transaction is too much work. The cost of any single entry is small. The cost repeats several times a day, every day, and it accumulates until the person quits.

At the moment of spending, a typical app asks the user to open it, find the right category, type an amount, pick a payment method, pick a date, and save. **[OBSERVATION]** That sequence is enough to end the habit.

### 3.2 What people do instead

**[FACT]** The author's own workaround is to send himself a WhatsApp message: `250 lunch`.

**[OBSERVATION]** People describe spending in a compressed, conversational way. They think *"250 lunch."* They do not think *"Create an expense. Amount = 250. Category = food. Payment method = …"*

**[OBSERVATION]** This has been seen in the author and in people around him. Sample size and rigour are not stated.

### 3.3 Pain points

| Pain | Status |
|---|---|
| Too many fields to fill for one small expense | **[OBSERVATION]** |
| Category selection forces a decision the user has not made | **[OBSERVATION]** |
| Repeating the same payment method and date every single time | **[OBSERVATION]** |
| Effort is paid *now*, benefit arrives *later* — so the habit decays | **[ASSUMPTION]** |

### 3.4 Why now

**[UNKNOWN]** The source does not state a "why now." No specific technology shift, market change, or trigger is claimed. This is a genuine gap: the PRD cannot assert that voice understanding recently became good enough, because the source does not say so.

### 3.5 Competitive context

**[FACT]** Voice-based expense tracking already exists. Kharcha Bolo and other voice expense trackers are in the market.

**[FACT]** A friend of the author used Kharcha Bolo. They found the core app fairly good, and rated the WhatsApp functionality in particular. They hit problems with WhatsApp voice-message recognition and transcription.

**[DECISION]** "Our app lets you record expenses with your voice" is not sufficient differentiation. The product must be judged on the quality of the **entire capture interaction**, not on the presence of voice input.

**[UNKNOWN]** The strongest competitive differentiation has not been determined. This is explicitly left open.

**[RISK]** Without an answer, VaaniTrack is a feature inside an occupied category rather than a product.

### 3.6 The real incumbent

**[DECISION]** The product is not only competing with expense apps. It is competing with **doing nothing, remembering later, messaging yourself, and keeping a personal note.**

**[RISK]** That incumbent has near-zero friction and zero install cost. Beating other apps is not enough; the product has to beat the free thing the user already does.

---

## 4. Objective

### 4.1 What we are trying to do

Make recording an expense so easy that people keep doing it.

**[DECISION — resolved 2026-09-05] v1 optimises for fidelity, not coverage.** The job is to never get wrong the thing the user actually said. It is *not* to capture everything they spend. Comprehensive expense coverage is not a v1 goal, and the product is not measured on it.

This is what makes the "never record a wrong transaction" constraint tractable: the system is accountable for the inputs it is given, not for the inputs it never received.

### 4.2 Why it matters

**[HYPOTHESIS]** If capture stops being work, the habit survives. Everything else a personal finance product could ever offer — insight, budgeting, planning — depends on there being data. Capture is the gate.

**[DECISION]** Solve the capture problem before expanding into broader personal finance.

### 4.3 How we measure success

**[DECISION]** The product optimises for **successful transaction capture**, not for speech-to-text accuracy.

This distinction is the heart of the product. A transcript can be word-perfect while the recorded transaction is wrong. If the user says *"I spent 500 on lunch"*, the words are transcribed correctly, and the system still records the wrong amount or category, **the product has failed.**

The primary metric is therefore:

> **Share of utterances that become a correct transaction with no manual correction and no unnecessary clarification.**

Supporting measures the source implies but does not name:

| Measure | Why it matters | Status |
|---|---|---|
| Clarification rate | Every question is friction; Principle 6 says ask rarely | Implied, no target |
| Correction rate | A correction means the first capture was wrong | Implied, no target |
| Time from intent to recorded | Must beat filling a form (Principle 11) | Implied, no target |
| Retention of the capture habit over weeks | The actual thing being tested (H2) | Implied, no target |

### 4.4 The bar

**[DECISION — resolved 2026-09-05]**

| Measure | Ship bar |
|---|---|
| **Amount correct** | **≥ 95%** of captures |
| **Whole transaction correct with no edit** | **≥ 80%** of captures |

**[RESEARCH]** These are set against what the literature says is achievable. An LLM-cascade approach reaches 95.6% on currency amounts and fine-tuning reaches 98.5%, so a 95% amount bar sits just under the demonstrated ceiling rather than above it. A 99% bar would have exceeded every published figure. See `RESEARCH.md` §1.1.

**[UNKNOWN]** These bars are set against published benchmarks on other datasets, not against VaaniTrack's own users. They should be re-tested once real utterances from the target segment have been measured.

---

## 5. Market Segment

**[DECISION — resolved 2026-09-05]** v1 targets **people who have tried an expense tracking app before and quit.** Their defining characteristic is a prior failed attempt, not a demographic.

**[RESEARCH]** This is a well-evidenced group. Most people who try manual tracking stop within **3–4 weeks**, and manual-entry fatigue is consistently named as the primary cause. The failure pattern matches the source document's description precisely: track diligently for a week or two, miss one entry, the record feels incomplete, the whole thing is quietly abandoned. See `RESEARCH.md` §4.

**[RISK]** This is a *behaviour*, not a reachable segment. There is no channel that targets "people who quit an expense app." Acquisition will need a proxy — and finding that proxy is unresolved.

**[RISK] — friction tension.** This segment quit because of friction, and v1 has chosen blocking review before save (FR-12), which adds a step back. *(▸ Superseded: FR-12 was reversed later in this same document — the build gates on confidence and auto-saves when all four conditions hold, with undo. Blocking review on every capture is not what shipped.)* One tap versus a seven-field form is still a large net win, but the product is adding friction for the group most sensitive to it. Held deliberately, not by accident.

**[DECISION]** The source's warning still stands: do **not** narrow to students or engineers without validation.

### Contextual constraints visible in the source

These are implied by the examples, not stated as decisions:

- Currency is ₹ (Indian Rupees) throughout.
- UPI appears as the example default payment method.
- Examples are Indian in texture: chai, Kharcha Bolo, a payee named Rahul.

**[ASSUMPTION]** The initial market is India. The source never states this, but every example points there. **This should be confirmed, not assumed.**

**[RISK]** If the market is India, then Indian-accented English is a day-one condition of use, not a later challenge. Section 14 of the source defers accent handling to after the core experience is robust. Those two things are in tension. See Open Question 8.

---

## 6. Value Proposition

### 6.1 The job the user is hiring the product for

*"Let me get this expense out of my head and into a record, right now, without stopping what I am doing."*

### 6.2 What the user gains

| Gain | Basis |
|---|---|
| Says one short thing instead of filling seven fields | **[DECISION]** Core interaction |
| Never has to repeat information that does not change | **[DECISION]** Defaults |
| Is not interrogated by the app | **[DECISION]** Minimal clarification |
| ~~Can fix a mistake by talking, not by editing a form~~ | **[NOT BUILT]** Conversational correction was cut. Correcting a past capture means editing a form — the opposite of this row |
| Can record several expenses in one breath | **[DECISION]** Multi-expense utterance |

### 6.3 Pains avoided

- No category hunting.
- No date picker.
- No payment-method dropdown on every entry.
- No mode switch away from what they were doing.

### 6.4 Where we must be better than competitors

**[UNKNOWN]** Undetermined — see 3.5.

The one concrete signal available: **[FACT]** the nearest competitor's known weak point is voice recognition quality on WhatsApp voice messages. Whether the differentiation is *better recognition*, *better understanding after recognition*, *better correction*, or something else entirely is **not decided**.

**[RISK]** Choosing differentiation late may mean building the wrong quality bar into the core.

---

## 7. Solution

### 7.1 Core experience

The fundamental interaction is:

> **Speak → Understand → Record**

**[DECISION]** The goal is not speech-to-text. It is understanding the financial meaning of what was said.

**The canonical flow:**

```
User speaks         "250 lunch"
        │
        ▼
Understand          financial intent, not just words
        │
        ▼
Fill each field, in this order of priority:
        1. what the user explicitly said        ← always wins
        2. high-confidence inference
        3. the user's configured default
        4. leave it unknown                     ← never invent
        │
        ▼
Confident?   yes ──▶ record it, say nothing
             no  ──▶ ask ONE minimal question    [Lunch] [Coffee]
        │
        ▼
Recorded.   User may correct it conversationally at any time.
```

**Worked example — "250 lunch"** should produce, with no questions asked:

| Field | Value | Source of value |
|---|---|---|
| Amount | ₹250 | explicitly said |
| Description | lunch | explicitly said |
| Category | food | inferred |
| Payment method | user's default | default |
| Date | today | inferred |
| Time | current / relevant transaction time | inferred |

### 7.2 Key features — functional requirements

Each requirement traces to a decision in the source.

#### FR-1 · Natural utterance capture

The user speaks freely. **[DECISION]** The system determines what information is available in the utterance rather than forcing a rigid command format. The user must not have to learn a financial-recording vocabulary.

Utterances that must work (all named in the source):

`"120 chai"` · `"500 dinner"` · `"300 groceries"` · `"I spent 700 on lunch"` · `"Paid 500 to Rahul"`

**[DECISION — resolved 2026-09-05]** `"Paid 500 to Rahul"` records as an ordinary expense: **amount ₹500, paid to Rahul, category empty.** A missing category is acceptable and must not trigger a question. This is *not* an entry into Layer 3 — no settlement, no balance, no expectation of repayment is created.

**[UNKNOWN]** If Rahul later repays, that event has no home in the model. Out of scope by decision, but noted.

#### FR-2 · Field inference

**[DECISION]** The system infers information whenever it can do so confidently. The user should not have to state every field.

**[DECISION — resolved 2026-09-05]** The governing constraint is: **never record a wrong transaction.** Efficiency of the first capture is the second priority, and it is subordinate. When the two conflict, correctness wins.

**[DECISION — resolved 2026-09-05]** Within that constraint, **infer aggressively.** Where defaults are configured and the utterance is clear, record without asking anything.

> `"250 lunch"` → recorded silently. Defaults are set. No ambiguity. No question.

**[DECISION — resolved 2026-09-05]** Where the utterance is genuinely ambiguous, **confirm.**

> `"250 to Pushpa"` → ambiguous. Confirm before recording.

The distinguishing rule, derived from the two examples above:

| Utterance shape | Behaviour |
|---|---|
| Amount + description ("250 lunch") | Fill every field, no questions → review card |
| Explicit payment verb + amount + person ("**Paid** 500 to Rahul") | Fill, category left empty, no questions → review card |
| Bare amount + person, no verb ("250 to Pushpa") | **Ask** — direction and nature are unstated |

**Note on "silently".** Since v1 shows a review card before saving (FR-12), nothing records without the user seeing it. "Infer aggressively" therefore means *do not interrogate the user* — pre-fill every field the system can. It does not mean *commit without showing*. The two are compatible: no questions, one confirmation.

**[ASSUMPTION]** The presence of an explicit outgoing-payment verb is what separates these two cases. This is inferred from the product owner's two examples, not stated by them. **Worth confirming.**

#### FR-3 · Defaults

**[DECISION]** Some transaction information is configurable as a default — for example, default payment method = UPI. The user then only mentions what differs from the default.

#### FR-4 · Explicit overrides default

**[DECISION]** `"300 lunch, paid in cash"` records **cash**, not the default. Stated information always beats a default.

The governing principle:

> **The user should only have to say what the system cannot reasonably infer from context or defaults.**

#### FR-5 · Multiple expenses in one utterance

**[DECISION]** `"I spent 300 on lunch, 150 on coffee, and 80 on a snack"` becomes **three separate transactions** — ₹300 lunch, ₹150 coffee, ₹80 snack.

**[DECISION]** No "expense group" abstraction is introduced merely because the expenses were spoken together. **[ASSUMPTION]** Close timestamps in the history communicate the connection well enough.

#### FR-6 · Conversational correction ~~(v1)~~ — **CUT**

> **▸ Cut — never built (18 Sept).** Correcting a previous capture by speaking does not exist. Correction is done by editing fields on the review card or in the transaction detail view. **One part survived by accident:** self-correction *inside* a single utterance — *"250, no wait, 280 on lunch"* — works, because the extraction prompt handles it. Cross-turn correction does not.


**[DECISION]** The user can correct a transaction by talking.

*Across turns:*

> "300 lunch and 150 coffee." → two transactions recorded
> "Actually, the coffee was 180." → the coffee transaction updates from ₹150 to ₹180

*Within one utterance:*

> "Uh, spent like 250… no, wait, 280 on lunch." → **one** transaction of ₹280. Not two transactions.

**[DECISION]** Correction intent must be understood **semantically**. Signals like *actually, no wait, make that, change that, was, not* are illustrative. **The logic must not depend on a hard-coded keyword.**

**[RISK]** Semantic correction across an open conversation history is materially harder than parsing a single utterance, and it is a v1 requirement. This is the most likely place for the experience to feel brittle.

**[DECISION — resolved 2026-09-05]** Correction context reaches the **current capture session only.** A correction applies to transactions captured in the session in progress — what was just said, and what was said a moment before. It does not reach yesterday's records, or earlier sessions today.

This matches how the correction examples in the source actually read, and it bounds ambiguity: the set of candidate targets stays small, so FR-7's clarification stays a two-choice question rather than a list.

**[UNKNOWN]** What ends a session — a timeout, closing the app, an explicit action — is not defined.

#### FR-7 · Ambiguous correction handling ~~(v1)~~ — **CUT**

> **▸ Cut — never built (18 Sept).** There is no correction-target disambiguation UI. It depended on FR-6, which was cut.


**[DECISION]** When the system knows a correction is happening but not which transaction it targets, it must **not guess silently.**

> "300 lunch and 150 coffee." → "Actually, make that 180."
> Both are plausible targets. The system asks:
> **Which one?**  `[Lunch]` `[Coffee]`

**[DECISION]** Ambiguity is resolved with the smallest possible interaction.

#### FR-8 · Minimal clarification ~~(v1)~~ — **CUT as specified**

> **▸ Cut — never built (18 Sept).** The tappable two-choice prompt was never built. Its job — asking rather than guessing — is done instead by the **review card**, which surfaces the uncertain fields for editing. Same principle, different interaction.


**[DECISION]** The system does not constantly ask questions. It asks only when the missing information materially affects the transaction, or when it genuinely cannot determine meaning.

**[DECISION]** `"250 lunch"` should ideally trigger **no clarification at all.**

**[DECISION]** When a question is necessary, it asks for the minimum, and it is itself low-friction — simple tappable choices such as `[Lunch] [Coffee]`, not a request to type an explanation.

#### FR-9 · Never fabricate financial information

**[DECISION]** The system does not invent financial data.

> `"I spent ₹400 on lunch yesterday."`
> Confidently known: amount ₹400, description lunch, date yesterday, payment method from default.
> **Not** to be fabricated: an exact transaction time, because none was given.

#### FR-10 · Field provenance

**[DECISION]** The product distinguishes four states for every field:

1. explicitly provided by the user
2. inferred with high confidence
3. supplied by a default
4. **unknown**

**[DECISION]** This matters especially because the product handles financial records.

Note: this requirement has no home in the transaction model as currently drafted (7.4). Provenance is a product requirement without a field.

#### FR-11 · Per-field confidence policy

**[DECISION — resolved 2026-09-05]** "Infer aggressively" and "never record a wrong transaction" are reconciled by applying confidence **per field**, weighted by what an error in that field actually costs. They are only contradictory if confidence is treated as one number for the whole transaction.

| Field | Cost of an error | Policy |
|---|---|---|
| **Amount** | Severe — corrupts the financial record | Highest bar. Confirm on any doubt. |
| **Payee / person** | High — the wrong person is a real error | High bar. Confirm when unclear. |
| **Description** | Low — the user's own words, readable later | Infer freely |
| **Category** | Low — cosmetic, and empty is acceptable (FR-1) | Infer freely; **leave blank rather than guess** |
| **Payment method** | Medium — but a default covers it | Take the default; confirm only if contradicted |
| **Date** | Medium | Infer "today" freely; confirm only on unusual relative dates |

**[RESEARCH]** This mirrors the "per-field selective risk control" approach in the document-extraction literature: auto-accept high-confidence fields, route low-confidence ones to review, and maximise automation without paying for errors. See `RESEARCH.md` §2.

**[RESEARCH]** Confidence must **not** be derived from token log-probabilities alone — these score only 0.705 ROC AUC as a correctness predictor. Self-consistency (parsing the same utterance more than once and checking agreement) is the strongest general-purpose signal, up to 0.82 AUROC. This is a finding about *how* to measure confidence, not an architecture decision.

#### FR-12 · Confidence-gated save  *(revised)*

**[DECISION — revised 2026-09-05, supersedes the blocking-review decision below]**
Confident captures are **logged immediately, without asking**. Only uncertain ones stop the user.

A capture is auto-logged when **both** hold:
- the extractor did not flag the utterance as ambiguous, **and**
- the amount carries provenance `said` — explicitly heard, not inferred or defaulted.

Anything else opens a review card. The amount is the one field that must never be silently wrong, so anything short of "said" earns a review.

**Auto-logged is not silent.** A confirmation strip names what was recorded and offers **Undo**. Saving without asking is only acceptable if reversing it is trivial.

> "250 lunch" → logged straight away
> "paid 500 to Rahul" → logged straight away
> "250 to Pushpa" → asks, because direction is unstated
> amount not heard → asks

**Why this changed.** The original decision made every capture cost a tap. In use that was the wrong trade for the target segment — people who quit expense apps over friction — and it wasted the confidence signal the extractor already produces. The `needsConfirmation` flag and per-field provenance were built for exactly this gate; blocking review ignored them and asked regardless.

**[RISK]** Principle 0 now rests on the confidence signal being well-calibrated rather than on a human checking every row. The Undo affordance and the ledger's edit path are the backstop. If measured amount accuracy comes in below the §4.4 bar, the honest response is to widen what counts as uncertain — not to remove the gate.

---

*Superseded — the original decision, kept for the record:*

**[DECISION — 2026-09-05, superseded]** Every capture shows the parsed transaction and requires an explicit save. Nothing is committed without the user seeing it.

```
  ┌────────────────────────────┐
  │  ₹250 · lunch              │
  │  food · UPI · today        │
  │                            │
  │  [ Edit ]        [ Save ]  │
  └────────────────────────────┘
```

**Rationale.** This is the strongest available guarantee against the primary constraint — never record a wrong transaction — and it is the direct mitigation for **R9** (36.3% baseline ASR accuracy on currency amounts). The amount is the field that must not be wrong, and it is the field the model is worst at. A review step makes every amount error visible before it becomes a record.

**Cost, stated plainly:**

- Every capture costs one tap, including the ones that were perfect.
- The target segment (people who quit over friction) is the group most sensitive to that tap.
- The nearest comparable competitor ships the same flow for the same stated reason, so this is not a differentiator.

**[DECISION]** Accepted regardless. Correctness is Principle 0; efficiency is subordinate.

**[UNKNOWN]** Whether the review step can be relaxed once measured accuracy is high — for example, dropping to passive confirmation for high-confidence captures — is not decided. Worth revisiting after the bar in §4.4 is met on real data.

**[DECISION — resolved by consequence]** The review card must show *which fields were said, inferred, or defaulted*. This settles the open provenance question: per-field provenance (FR-10) is required, because the UI needs it. Nullable fields alone are insufficient.

### 7.3 Interaction principles

Restated from the source, all **[DECISION]**:

1. Optimise for successful transaction capture, not speech-to-text accuracy alone.
2. The user speaks naturally rather than learning rigid commands.
3. Infer whenever confidence is high.
4. Defaults eliminate unnecessary questions.
5. Explicit information overrides defaults.
6. Clarify only when genuinely necessary.
7. Clarify with the minimum possible question.
8. Never silently fabricate financial information.
9. Multiple expenses spoken together become separate transactions.
10. Corrections happen conversationally.
11. The core interaction must feel **faster than filling out an expense form.**
12. Solve capture before expanding into broader personal finance.

**[RESOLVED 2026-09-05]** Principles 3 and 8 were previously in direct tension, with no threshold separating them. This is now settled by **FR-11**: confidence is assessed per field, weighted by the cost of an error in that field. Principle 3 governs cheap fields (description, category), Principle 8 governs expensive ones (amount, payee). Principle 0, added below, governs the whole.

**Principle 0 — overriding all others: never record a wrong transaction.** Capture efficiency is subordinate to correctness.

### 7.4 Transaction model

**[DECISION]** The final data model should emerge from the product requirements rather than being over-specified now. **[DECISION]** No field should be added merely because expense applications conventionally have it.

Minimum fields currently imagined:

| Field | Note |
|---|---|
| `id` | |
| `amount` | |
| `description` | |
| `category` | **Nullable.** Empty is a valid, acceptable state (FR-1). Never guessed to avoid a blank. |
| `payment_method` | Default-eligible (FR-3) |
| `date` | |
| `time` | **[DECISION — resolved 2026-09-05]** Not a v1 requirement. Not asked for, not inferred, never fabricated. Stored only if the user explicitly says it. `created_at` serves as the practical timestamp. Retained in the model as a future field. |
| `created_at` | Set by the system at capture. Always present. |
| `source` | **[UNKNOWN]** the source document does not define what this field holds |

**[ASSUMPTION]** My reading of the time decision is: *drop it as a v1 capture requirement, keep the field for later.* The instruction — "generally I want time to be a thing, but time is not required for now, just leave the time category" — admits a second reading (remove it entirely). **Flagged for confirmation.**

**[RESEARCH]** This decision is well supported by the data independently of product preference: timestamps score **3.4% baseline accuracy** in ASR numeric-expression benchmarks, the worst of any category measured. Capturing time reliably would have been the single hardest thing in the product. See `RESEARCH.md` §1.1.

**[DECISION — resolved 2026-09-05] Per-field provenance is required.** Each field carries whether its value was *said*, *inferred*, *defaulted*, or *unknown*. Nullable fields alone are insufficient, because the review card (FR-12) must show the user which values came from where. Settled as a consequence of choosing review-before-save.

### 7.5 Edge cases

| # | Case | Required behaviour | Status |
|---|---|---|---|
| E1 | Several expenses in one utterance | Separate transactions, no grouping | **[DECISION]** |
| E2 | Self-correction mid-sentence | Final intended value only, one transaction | **[DECISION]** |
| E3 | Correction in a later turn | Update the existing transaction | **[DECISION]** |
| E4 | Correction with an ambiguous target | Ask, with minimal tappable choices | **[DECISION]** |
| E5 | Information genuinely absent | Leave unknown; do not invent | **[DECISION]** |
| E6 | Explicit value conflicts with a default | Explicit wins | **[DECISION]** |
| E7 | Background noise, fast speech, imperfect pronunciation | Named as a challenge; behaviour undefined | **[UNKNOWN]** |
| E8 | Payment naming a person ("Paid 500 to Rahul") | In scope as an utterance; semantics undefined | **[UNKNOWN]** |
| E9 | Utterance the system cannot interpret at all | Not addressed anywhere in the source | **[UNKNOWN]** |
| E10 | User wants to delete rather than correct | Not addressed anywhere in the source | **[UNKNOWN]** |
| E11 | Same expense captured twice | Not addressed anywhere in the source | **[UNKNOWN]** |

E9, E10 and E11 are gaps this PRD is surfacing, not inventing answers for.

### 7.6 Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A1 | Users already have a mental model for lightweight capture, so no vocabulary must be taught | Onboarding becomes a real product problem |
| A2 | A user's payment method is stable enough that a default usefully removes a field | Defaults cause silent wrong data — worse than asking |
| A3 | Close timestamps communicate "spoken together" adequately | Grouping returns as a requirement |
| A4 | Speaking is genuinely faster than a form in real conditions | Principle 11 fails and the core premise weakens |
| A5 | Correction and provenance behaviours can be made to feel natural rather than brittle | The differentiating experience becomes the frustrating one |
| A6 | The initial market is India (inferred from ₹, UPI, chai, Kharcha Bolo — never stated) | Accent, currency and payment-method assumptions all shift |

### 7.7 Technology

**[DECISION]** Out of scope for this document. No stack, architecture, or implementation choice is made here. The source explicitly asks that the PRD describe *what problem we are solving and what the product should accomplish*, not how to build it.

---

## 8. Scope, Non-Goals and Release

### 8.1 The three layers of personal finance

The author frames personal finance as three layers:

| Layer | Contents | Status |
|---|---|---|
| **1 — Money you have** | cash, bank accounts, UPI, investments, stocks | **[DECISION]** out of scope |
| **2 — Money you spend** | expense capture | **[DECISION]** THE CURRENT FOCUS |
| **3 — Money you owe / are owed** | borrowing, lending, shared expenses, settlements, Splitwise-like | **[DECISION]** out of scope, interesting later |

**[DECISION]** Do not expand into Layers 1 or 3 except to note them as future possibilities.

### 8.2 Explicit non-goals

**[DECISION]** All of the following are deliberately outside the current product:

investment tracking · stock portfolio management · wealth management · budgeting systems · financial dashboards · advanced analytics · debt management · lending and borrowing · Splitwise-style settlement · broad financial aggregation · multilingual support in v1 · complicated expense grouping

These may become future directions. The current question is much narrower:

> **Can we make recording an expense so frictionless that people actually keep doing it?**

### 8.3 Language strategy

**[DECISION]** Start with English.

**[DECISION]** After the core experience is robust, address: Indian accents · varying speaking speeds · background noise · imperfect pronunciation · natural conversational speech · corrections · multiple expenses per utterance.

**[DECISION]** Indian languages and Hinglish / code-switching are a future expansion, not a v1 requirement.

**[DECISION — confirmed 2026-09-05]** English first, multilingual later. The product owner has accepted that this sits oddly with the product's name (*vaani* = voice/speech) and considers that acceptable.

**[DECISION — resolved 2026-09-05] Indian-accented English is a v1 requirement.** This is a separate decision from the language one, and it is settled on cost grounds: it is free.

> **▸ Not what was built (18 Sept).** The reasoning below rests on self-hosting Whisper so that no audio leaves the device. The shipped app uses a **hosted** transcription API, and audio that the user consents to keep is uploaded to **Supabase Storage** and retained 90 days. The cost argument held; the privacy property did not survive the build, and nothing here should be read as describing how the app treats recordings.

**[RESEARCH]** Whisper is MIT-licensed and runs fully offline — no API key, no per-minute billing, no audio leaving the machine. The model that handles Indian accents well (large-v3, single-digit WER on the Svarah benchmark) is the same model that can be self-hosted at zero licensing cost via **whisper.cpp** (pure C/C++, CPU-only, no GPU required) or **faster-whisper** (large-v3 in ~3GB VRAM at int8).

The Svarah paper's "difficult to deploy in the Indian context" caveat concerns model size and inference cost at scale — not achievability, and not an MVP with a small number of testers. The accurate path and the free path are the same path.

**[UNKNOWN]** Where inference runs for a mobile client — a self-hosted server, or an on-device smaller model with worse accent handling — is an implementation choice, not settled here. It becomes a real cost question at scale, not at MVP.

**[UNKNOWN]** Indian numeric speech forms — lakh/crore, and code-switched numerals such as *"dhai sau"* appearing inside otherwise-English sentences — were not directly tested in the research. Worth validating early.

### 8.4 Release shape

**[UNKNOWN]** The source states no timeline, no team size, and no delivery surface.

**[DECISION — resolved 2026-09-05] No WhatsApp.** WhatsApp is not a delivery surface for v1. VaaniTrack ships as its own voice-first application.

**[RISK]** WhatsApp was the competitor's rated strength and is the user's own existing workaround. Declining that surface means the product must be worth opening on its own — it competes with self-messaging without borrowing self-messaging's reach. This is a legitimate choice; the cost is that acquisition and habit formation get harder.

What v1 must contain, by decision:

- Voice capture of a natural utterance (FR-1) — *built*
- Inference and defaults (FR-2, FR-3, FR-4) — *built; defaults are hard-coded, with no settings screen*
- Multiple expenses per utterance (FR-5) — *built*
- ~~Conversational correction, including ambiguous cases (FR-6, FR-7)~~ — **cut, never built**
- ~~Minimal clarification UI (FR-8)~~ — **cut, never built.** The review card serves this role instead
- No fabrication, with provenance (FR-9, FR-10) — *built, and the core of the product*
- English — *still true*

> **▸ This list is no longer what v1 contains (18 Sept).** Three of its seven items were cut. What shipped in their place, and is absent from this list entirely, is the **journal** — the ability to browse, inspect and correct history — which turned out to matter more than conversational correction. See `CONTEXT.md` §12.

Explicitly later: Layers 1 and 3, multilingual, everything in 8.2.

---

## 9. Hypotheses and Validation

**[HYPOTHESIS] H1 — Core.** People abandon expense tracking because logging individual transactions creates too much friction.

**[HYPOTHESIS] H2 — Stronger form.** People *want* to record their spending, but existing recording interactions have enough friction that they stop. If expense capture becomes fast and natural enough, users may be able to maintain the habit.

**[HYPOTHESIS] H3.** A voice-first interface reduces friction *enough* to change that outcome.

**[DECISION]** These are hypotheses, not established facts, and must remain visible as such.

### What has explicitly not been proven

Every item below is **[UNKNOWN]**, carried over from the source as an open validation question:

1. That people abandon expense tracking *primarily* because of input friction
2. That voice materially improves retention
3. That users will prefer voice over existing manual entry
4. That users will trust an AI to interpret financial transactions
5. That the system can interpret natural speech accurately enough
6. How frequently clarification will be required
7. How well the system performs under real-world background noise
8. Whether users will switch from existing solutions
9. Whether the product has meaningful differentiation from existing voice expense trackers
10. Which exact user segment experiences this problem most strongly
11. Whether voice capture alone is valuable enough to become a standalone product

**[DECISION]** None of these may be presented as established facts.

---

## 10. Risks

| # | Risk | Why it matters |
|---|---|---|
| R1 | **The incumbent is "doing nothing."** Self-messaging, notes, and memory cost nothing and need no install. | The product must beat free and frictionless, not just beat other apps. |
| R2 | **Differentiation unresolved.** Voice expense tracking is an occupied category. | Without an answer, this is a feature, not a product. |
| R3 | **Financial trust.** A confidently recorded wrong amount damages trust more than a question would. | Silent misinterpretation is the worst failure mode available to this product. |
| ~~R4~~ | ~~**Infer-vs-ask has no threshold.**~~ | **Retired** — resolved by FR-11 (per-field confidence). |
| R5 | **ASR is the known failure point of the nearest competitor.** | If recognition is not materially better, VaaniTrack inherits the same failure. |
| R6 | **Correction scope.** Semantic, cross-turn correction is a v1 requirement and is hard. | The signature feature is also the most brittle. |
| R7 | **Accent sequencing.** Accent robustness is deferred while the implied market is India. | v1 may fail for its actual first users. |
| R8 | **Metric without a bar.** The right metric is named; no target exists. | "Good enough to ship" cannot be evaluated. |

### Risks added by research (see `RESEARCH.md`)

| # | Risk | Evidence |
|---|---|---|
| **R9** | **Currency-amount recognition is the weakest link in the entire stack, and it sits on the highest-stakes field.** Baseline ASR accuracy on currency amounts is **36.3%** — the lowest of every numeric category measured. | arXiv 2408.00004 |
| R10 | **The accent penalty compounds with the amount problem** — both land on the same utterance. | Svarah, gap of 5.65–43.03 points |
| R11 | **Automatic bank/SMS import is a stronger friction solution on paper** and already ships in a competitor. Voice lowers the cost of an entry; it does not remove the need to remember to make one. | "Say" app; retention literature |
| R12 | **An Indian competitor already ships a superset of v1.** Kharcha does voice logging in all Indian languages plus receipt OCR and an AI assistant. | kharcha.ind.in |
| R13 | **Whisper-class models are hard to deploy in the Indian context** — implying either server-side inference cost or an on-device accuracy compromise. | Svarah paper |
| R14 | **Indian numeric speech forms are untested** — lakh/crore and code-switched numerals in English sentences. | Not directly researched; flagged |

**R9 is the most important risk in this document.** The mitigation is known and effective — fine-tuning lifts currency accuracy to 98.5%, an LLM-cascade approach reaches 95.6% — but neither happens by default. Off-the-shelf transcription will not meet the "never record a wrong transaction" bar.

---

## 11. Contradictions and Weak Points Identified

| # | Contradiction | Status |
|---|---|---|
| 1 | Infer aggressively (P3) vs. never fabricate (P8) — no threshold, no per-field rule | ✅ **Resolved** by FR-11 and Principle 0 |
| 2 | `time` is a model field but may be legitimately unknown | ✅ **Resolved** — not a v1 requirement |
| 3 | English-first vs. an Indian market | ⚠️ **Partly resolved** — languages settled, **accents still open** (Decision 8) |
| 4 | "Paid 500 to Rahul" in scope while Layer 3 is out | ✅ **Resolved** — ordinary expense, category empty |
| 5 | The success metric has no number | ❌ **Open** (Decision 6) |
| 6 | Provenance (FR-10) has no representation in the data model | ❌ **Open** (Decision 3) |
| 7 | Delivery surface never stated | ✅ **Resolved** — own app, no WhatsApp |

**New tension introduced by research, not present in the source:**

| 8 | **Confirm-before-save vs. record-silently.** The nearest comparable competitor (Peggy) shows the parsed result and requires review before saving, explicitly to "prevent silent errors," and prioritises control over automation. VaaniTrack's decision is the opposite for clear utterances. Both cannot be right about what users want — unless the answer differs by field, which is what FR-11 argues. | ⚠️ **Live design question** |

---

## 12. Open Product Questions

**Answered on 2026-09-05:** ~~1. infer vs. ask threshold~~ · ~~2. which fields are inference-eligible~~ · ~~7. "Paid 500 to Rahul"~~ · ~~10. delivery surface~~ · ~~language strategy~~ · ~~time~~

**Still open:**

1. How is an unknown value represented — null, or explicit provenance on every field? *(was Q3)*
2. Which user segment are we building for first? *(was Q4)*
3. What is our differentiation, now that the category is known to be crowded? *(was Q5)*
4. What capture success rate counts as good enough to ship? *(was Q6)*
5. Is Indian-accented English a v1 requirement? *(was Q8 — sharpened by research, not resolved by the English-only decision)*
6. How far back does correction context reach — last utterance, session, or day? *(was Q9)*
7. What happens when an utterance cannot be interpreted at all? *(E9)*
8. Can a user delete a transaction by voice, or only correct one? *(E10)*

**Raised by research:**

9. Where do we stand against automatic bank/SMS import, which removes the discipline requirement rather than merely lowering it? *(see `RESEARCH.md` §4 — the cash/informal/context argument is the strongest available answer)*
10. Do we confirm the amount even in "clear" utterances, given 36.3% baseline ASR accuracy on currency? FR-11 says confirm on doubt — but the research suggests doubt may be the normal case until the model is adapted.

---

## 13. Decisions Still Needed Before Build

### Resolved on 2026-09-05

| # | Decision | Resolution |
|---|---|---|
| ~~1~~ | Confidence threshold for inferring vs. asking | **Per-field, weighted by cost of error** (FR-11). Never record a wrong transaction is Principle 0; efficiency is subordinate. |
| ~~2~~ | Which fields are inference-eligible | **Description and category infer freely. Amount and payee take the highest bar.** Category may be empty. |
| ~~7~~ | Person-named payments | **"Paid 500 to Rahul" is an ordinary expense**, category empty. Not Layer 3. Bare "250 to Pushpa" confirms. |
| ~~10~~ | Delivery surface | **Own app. No WhatsApp in v1.** |
| — | Language strategy | **English v1**, multilingual later. Name tension accepted. |
| — | `time` field | **Not a v1 requirement.** Kept in the model for later. |

### Also resolved on 2026-09-05

| Decision | Resolution |
|---|---|
| Amount confirmation | **Review before save on every capture** (FR-12). Correctness over efficiency, accepted with its costs stated. |
| Target segment | **People who have tried an expense app and quit.** A behaviour, not a demographic. |
| Success bar | **≥95% amount correct, ≥80% whole transaction correct with no edit.** |
| Correction window | **Current capture session only.** |
| Indian-accent robustness | **Required in v1** — settled on cost grounds, since self-hosted Whisper is free. |
| Provenance representation | **Per-field provenance required** — a consequence of review-before-save. |
| v1 scope | **Fidelity, not coverage.** Never get wrong what the user said; do not aim to capture everything they spend. |

### Still open

| # | Decision | Status |
|---|---|---|
| **1** | **Market positioning against ~10 live competitors.** | **Deliberately deferred.** Does not block the build. Easier to answer after watching people use v1. The strongest available ground, per research, is the coverage gap auto-import cannot reach — cash, person-to-person payments, and what a spend was actually for. |
| **2** | ~~**What ends a capture session.**~~ | *Moot — FR-6 was cut, so nothing depends on this any more.* |
| **3** | **What happens when an utterance cannot be interpreted at all.** | E9 — never addressed in the source. |
| **4** | **Whether a transaction can be deleted by voice.** | E10 — never addressed in the source. |
| **5** | **Where inference runs** — self-hosted server vs. on-device. | Implementation choice; a cost question at scale, not at MVP. |
| **6** | **Whether review-before-save can relax later** once measured accuracy clears the §4.4 bar. | Revisit post-benchmark. |

---

## 14. Tooling notes

**[RESEARCH — 2026-09-05]** Evaluated at the product owner's request.

**OpenWhispr** (github.com/OpenWhispr/openwhispr) — MIT licensed, 6.9k stars, 2,140 commits, actively developed. Local transcription via Whisper and NVIDIA Parakeet, with optional cloud backends.

**Not usable as a dependency.** It is an end-user desktop application for macOS/Windows/Linux, distributed as DMG/EXE/AppImage — not a library, and it does not run on mobile. **Useful as MIT-licensed reference code** for local Whisper integration, audio capture, and model management.

**The underlying stack is the relevant part:**

| Option | Fit |
|---|---|
| **whisper.cpp** | Pure C/C++, no Python, no GPU required. Fast on Apple Silicon, runs on CPU. Real-time via `--stream`. |
| **faster-whisper** | CTranslate2 reimplementation, 4–5× faster than original Whisper. large-v3 in ~3GB VRAM at int8. Built-in VAD. |

Both MIT. Both run large-v3 — the model with single-digit WER on Indian accents — at zero licensing cost.

**This does not settle architecture.** The research favours a *transcribe → LLM interprets* cascade for currency accuracy (95.6%), which means transcription is only the first stage. Whisper solves the accent half of R9; it does not solve the amount half.

---

*This document describes what problem we are solving and what the product should accomplish. It makes no technology, architecture, or implementation decisions.*

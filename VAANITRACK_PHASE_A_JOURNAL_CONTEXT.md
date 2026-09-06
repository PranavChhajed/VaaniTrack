# VaaniTrack - Phase A: Transaction Journal

## Purpose

This document captures the current agreed product context and direction for Phase A of VaaniTrack. It is intended to be given to Claude or another implementation agent before work begins.

**Phase B should not begin until Phase A is confirmed and implemented.**

---

# 1. Product Context

**VaaniTrack** is a voice-first expense capture app for the Indian market.

Core interaction:

> Speak an expense the way you would text it to yourself, such as "250 lunch", and it becomes a structured transaction.

Product scope:
- Indian rupees.
- UPI as the default payment method.
- Indian-accented English.
- Voice-first interaction.
- Spending capture only.

VaaniTrack deliberately does not currently include:
- budgets
- analytics
- investments
- split-bill functionality
- bank sync

## Target user

The target user is someone who has tried an expense app before and quit.

The core hypothesis is that people abandon expense tracking because logging each transaction creates too much friction. Removing that friction should make the habit sustainable.

## Governing principle

> **Never record a wrong transaction.**

Capture speed is subordinate to correctness. A confidently recorded wrong amount or date damages trust more than asking an additional question.

---

# 2. Existing Voice Capture System

The current core loop works on a real phone:

```text
Voice
  ↓
Whisper large-v3 transcription
  ↓
LLM interpretation
  ↓
Structured transaction
  ↓
Confidence-gated save or review
```

Current fields:

```text
amount
description
category
payment_method
date
time
payee
```

## Per-field provenance

Each field can be:

```text
said
inferred
default
unknown
```

This lets the UI distinguish information explicitly supplied by the user from information inferred or supplied by the system.

## Existing defaults

- Payment method = UPI unless explicitly stated otherwise.
- Date = today unless explicitly stated otherwise.
- Explicit user input overrides defaults.

## Existing save behavior

If the model is confident and the amount was explicitly heard, the transaction can be saved immediately with an Undo option.

If something is ambiguous, the system shows a review state and asks.

This is intentionally not a confirm-every-time flow.

## Multiple expenses

One utterance can produce multiple transactions.

Example:

```text
"300 lunch and 150 coffee"
```

becomes two transactions.

## Category

Categories can be inferred. The current categorization system can be improved later.

The important rule is that uncertain category information should not be presented as certain.

## Current storage

Storage is currently `localStorage`.

There are no accounts, server database, or sync yet.

---

# 3. Accuracy Context

Real testing shows:
- Amounts tend to be reliable.
- Descriptions and names are more vulnerable to transcription errors.
- Proper nouns are particularly difficult.
- Terse utterances can degrade more than longer natural sentences.
- Longer natural sentences provide more linguistic context.

Examples:

```text
"500 lunch, 600 dinner, 700 outing."
→ 3 transactions, all correct

"900 groceries."
→ correct

"7.50 at dinner."
→ ₹750, recovered from a decimal artifact

"50 Rahul."
→ amount right, payee dropped

"500 for Kronov."
→ amount right, payee garbled
```

This matters for Phase B because temporal language will eventually be added to the interpreter.

---

# 4. Existing Design Language

The visual language is already established and should not be redesigned in Phase A.

- Warm oat paper background.
- Near-black ink.
- Forest green.
- Mint.
- Ember orange accent.
- 2px solid ink borders.
- Zero drop shadows.
- Large corner radii.
- EB Garamond for display text and monetary figures.
- Figtree for UI.
- Tabular figures for monetary amounts where appropriate.
- The ledger is a dark chamber: a near-black inset panel with oversized radii against the light paper background.

The light/dark alternation provides the page rhythm.

---

# 5. Why the Journal Exists

The new feature is a **transaction journal**.

It is a historical record of spending, organized around dates, where users can inspect and correct transactions.

The broader product insight is:

> People are not always in the moment when they remember an expense.

A user may remember a payment days later and need to place it on the correct historical date.

Phase A establishes the journal itself.

Phase B later teaches the voice interpreter to understand spoken dates.

---

# 6. Phase Structure

## Phase A - Transaction Journal

Phase A establishes:
- journal representation
- day grouping
- day totals
- transaction ordering
- basic calendar/date navigation
- transaction rows
- transaction detail
- editing
- deleting
- empty states
- sparse-day capture behavior
- relationship between capture and journal
- honest handling of known and unknown information

## Phase B - Spoken Dates

Phase B comes only after Phase A is confirmed and implemented.

It will adapt the voice interpreter to understand:
- "on 2 September"
- "last Tuesday"
- "the 2nd"
- "yesterday"

and to refuse or review dates it cannot resolve reliably.

Phase B should build on the semantics established in Phase A.

---

# 7. Journal Mental Model

The journal is:

> **The historical memory of what VaaniTrack recorded.**

It is not:
- a calendar
- analytics
- a dashboard
- a budgeting screen
- another capture screen

The journal should answer:

> What did I record?

> When is the transaction recorded for?

> What did I spend it on?

> Can I find and correct it?

---

# 8. Journal Structure

The journal is organized around populated days.

Conceptually:

```text
JOURNAL

SEPTEMBER 6                                  ₹830

Lunch                                        ₹250
Metro                                         ₹60
Coffee                                       ₹120


SEPTEMBER 5                                ₹1,350

Groceries                                    ₹900
Dinner                                       ₹450
```

Each day contains:
1. Date.
2. Total for that date.
3. Transactions belonging to that date.

The journal is date-oriented and chronological.

---

# 9. Date Semantics

Every transaction has exactly one **transaction date**.

Transaction date means:

> The date the spending happened.

It must not be derived from:
- the selected journal date
- the page being viewed
- scroll position
- journal navigation state
- another screen's state

The transaction itself owns its date.

This is a core trust rule.

---

# 10. Capture and Journal Must Remain Separate

There are two product modes:

### Capture

> **I want to record an expense.**

### Journal

> **I want to inspect my recorded history.**

The product should feel like one system with two modes:

```text
CAPTURE ↔ JOURNAL
```

Capture remains the default/home experience because VaaniTrack is voice-first.

## Critical rule

Browsing a date in the journal must not silently change where a new capture is recorded.

Example:

```text
User is looking at September 2.
User goes to capture.
User says: "400 dinner."
```

The selected journal date must not silently cause the transaction to become September 2.

The current default remains:

> No explicitly supplied transaction date → today.

Phase B will later add explicit spoken-date handling.

---

# 11. Time Semantics

There are two separate concepts:

### Transaction time

The time the spending actually happened.

### Logging time

The time VaaniTrack recorded the transaction.

The existing `created_at` value represents logging time.

## Agreed UI direction

**Keep a time visible in the journal, but make it very, very subtle.**

The displayed time indicates:

> **When the user logged the transaction in VaaniTrack.**

It does **not** claim to be the time the expense occurred in the real world.

Example:

```text
Dinner                                      ₹400
UPI

                         logged 9:40 PM
```

The logging time should have much less visual weight than the amount and reason.

Do not display `created_at` as an unlabeled clock time if that could make it look like transaction time.

Prefer an explicit subtle label such as:

```text
logged 9:40 PM
```

or equivalent wording.

If the system later stores a genuine transaction time separately, it must remain semantically distinct from logging time.

---

# 12. Unknown Transaction Time

A transaction can be completely known while its **transaction time** is unknown.

Example:

```text
"₹200 breakfast at 10, ₹350 lunch at 1, ₹120 coffee"
```

The resulting state can be:

```text
Breakfast
amount = ₹200
transaction time = 10 AM

Lunch
amount = ₹350
transaction time = 1 PM

Coffee
amount = ₹120
transaction time = unknown
```

Coffee is not an "unknown transaction."

Only its transaction time is unknown.

The system must not infer coffee's transaction time merely because it was spoken after lunch.

Core principle:

> **Never use visual ordering to imply a temporal fact that is not known.**

The exact visual treatment of unknown transaction times remains a design detail to finalize.

---

# 13. Transaction Ordering

Known transaction times can be used for chronological ordering.

Unknown transaction times must not be assigned a fake position that implies when the transaction happened.

For example, if:

```text
10:30 AM Breakfast
1:15 PM Lunch
unknown-time Coffee
```

the UI must not position Coffee between the two known times merely because of speech order.

The semantic rule is fixed:

> Known time can establish chronology. Unknown time cannot.

The exact visual treatment can be decided during the detailed UI pass.

---

# 14. Row Information Hierarchy

The amount should have strong visual weight, but the reason/description is also a primary piece of information.

The journal needs to answer both:

> What did I spend?

and:

> What did I spend it on?

Therefore:

### Primary

1. Amount.
2. Reason / description.

### Secondary

3. Payee.
4. Payment method.
5. Category.
6. Logging time.

Example:

```text
Dinner                                      ₹450
Food · UPI
logged 8:32 PM
```

The amount is visually prominent, but the reason must remain immediately legible.

The journal is not merely a list of numbers. It is a memory of spending.

---

# 15. Row Design Principle

Rows should be optimized for scanning.

Do not force every field onto every row.

If information is unavailable, do not fabricate it merely to make the row look complete.

For example:

```text
Dinner                                      ₹450
UPI
logged 8:32 PM
```

is preferable to inventing a category.

The detail screen can expose the complete record.

---

# 16. Category Treatment

Categories may be derived by the system.

The current category inference is not final and can be improved later.

Phase A should support inferred categories as valid transaction data.

The important rule is:

> Do not represent an uncertain category as certain.

Category is supporting information, not the core identity of the transaction.

---

# 17. Payee - Dedicated Mini-Design

Payee should receive its own design treatment.

This is more than an implementation detail.

Payee, reason, and category represent different concepts:

```text
Reason
What was the spending for?

Payee
Who or where did the money go to?

Category
What type of spending was it?
```

Example:

```text
"₹500 for dinner at Saravana Bhavan"
```

could become:

```text
amount = ₹500
reason = dinner
payee = Saravana Bhavan
category = Food
```

Another input:

```text
"₹500 Rahul"
```

could become:

```text
amount = ₹500
payee = Rahul
reason = unknown
```

The journal should not discard a valid payee simply because there is no conventional description.

The payee mini-design should later define:
- what counts as a payee
- extraction rules
- relationship with description
- journal display
- detail display
- uncertainty
- correction/editing
- future voice improvements

This is intentionally a near-term design task, but it is separate from the basic journal structure.

---

# 18. Date Navigation

Phase A uses a **basic calendar/date picker**.

The calendar is a navigation mechanism, not the primary representation.

## Opening state

The journal opens at **today**, showing the newest/latest transactions available.

## Scrolling

Continuous scrolling is **not** a Phase A requirement.

Do not lock the design to an infinite chronological feed yet.

The requirement is simply:

> The user must be able to navigate historical dates easily.

## Date jump

A basic calendar/date picker is the chosen direction.

Conceptually:

```text
JOURNAL
    ↓
Date picker
    ↓
Select date
    ↓
Journal shows that date
```

## Today

Provide a clear way to return to Today after navigating elsewhere.

---

# 19. Empty Dates

Do not render every empty date in the historical journal.

Avoid:

```text
September 6
September 5
September 4
No transactions
September 3
No transactions
September 2
```

That would make the journal behave like a calendar.

Only dates with actual transactions should appear in the populated journal.

The calendar can still navigate to a date with no transactions.

---

# 20. Empty-Day Capture

An empty day creates a natural opportunity to encourage recording.

If the user navigates to a day with no transactions, the voice capture action should be **more prominent**.

Conceptually:

```text
SEPTEMBER 3

No transactions recorded.

        Record an expense
```

For a sparse day:

```text
SEPTEMBER 3                         ₹650

Lunch                               ₹250
Metro                                ₹400

        + Record expense
```

For a heavily populated day, the capture action becomes a quieter secondary action.

The design principle is:

> **Encourage capture when the journal is sparse, but get out of the user's way when the page is already populated.**

The "4-5 transactions" idea is a design intuition, not a hardcoded threshold.

The exact prominence model should remain configurable.

## Critical date rule

The selected journal date must not silently become the capture date.

Bad:

```text
User views September 3.
User presses voice.
App silently records the transaction as September 3.
```

Potentially good:

```text
User explicitly chooses "Record for September 3".
Capture opens with that explicit intent established.
```

This second model needs a proper interaction design before implementation.

---

# 21. Completely Empty Journal

If there are no transactions anywhere:

```text
YOUR JOURNAL IS EMPTY

Expenses you record will appear here,
organized by day.

        Record an expense
```

The action takes the user to the capture experience.

Avoid generic language such as:

> "Start tracking your spending."

The product is specifically about recording transactions.

---

# 22. Transaction Detail

Tapping a transaction opens transaction detail.

The row is optimized for scanning.

The detail view is optimized for inspection and correction.

Conceptually:

```text
DINNER

₹450

September 2, 2026

Payment
UPI

Category
Food

Payee
Saravana Bhavan

Time
Unknown

Logged
September 6, 2026 · 9:40 PM
```

The exact visual design should follow the established VaaniTrack language.

The detail view should expose the complete transaction state.

---

# 23. Provenance in Detail

The existing field-level provenance remains available:

```text
said
inferred
default
unknown
```

Do not clutter journal rows with provenance indicators.

In detail, provenance can explain why a value exists.

Examples:

```text
Payment method
UPI
Default
```

or:

```text
Amount
₹400
Said
```

This becomes especially important in Phase B when dates can be spoken and resolved.

---

# 24. Editing

Editing ships in Phase A.

This is necessary for:
- user trust
- correction of wrong records
- testing multi-day journal behavior before Phase B

Editable fields:

```text
Amount
Description / reason
Category
Payment method
Date
Time
Payee
```

Date editing is required so that Phase A can create realistic historical test data before spoken dates exist.

---

# 25. Editing Behavior

Edits update the journal immediately.

## Amount changes

Recalculate the relevant day total.

## Date changes

Immediately:
- remove the transaction from its old day
- add it to the new day
- recalculate both day totals
- reorder as necessary

## Time changes

Update ordering where relevant.

## Other field changes

Update the row and detail view immediately.

No manual refresh should be required.

---

# 26. Delete

Deletion is destructive.

Use one deliberate confirmation step:

```text
Delete transaction?

This will permanently remove this transaction.

Cancel                    Delete
```

After deletion:
- remove the transaction immediately
- update the day total
- remove the day if it becomes empty
- show the empty-journal state if the entire journal becomes empty

---

# 27. Duplicate-Looking Transactions

The journal must support legitimate transactions with identical fields.

Example:

```text
₹100 Chai
₹100 Chai
```

These may be two separate purchases.

Do not automatically deduplicate based on:

```text
amount + description + date
```

Each transaction needs its own unique ID.

The journal should faithfully display separate transactions unless the user explicitly deletes one.

---

# 28. Date Boundaries

Phase A must correctly handle:
- today
- yesterday
- month boundaries
- year boundaries
- multiple months
- multiple years
- empty dates

Examples:

```text
September 1
August 31
```

and:

```text
January 1, 2027
December 31, 2026
```

must behave as normal dates.

---

# 29. Future Dates

Future-date behavior needs an explicit policy before implementation.

Recommended direction:
- The system should never implicitly generate a future transaction date.
- A future date, if allowed, must come from explicit user input.
- Journal navigation must never generate a future transaction date.

Whether manual editing should allow future dates should be finalized before implementation.

If future-dated expenses are not useful to the product, the simpler option is to reject future dates during editing.

---

# 30. Important Phase A Failure Modes

Phase A should explicitly guard against:

### Wrong day grouping

A transaction must appear under its stored transaction date, not its creation date.

### Wrong time interpretation

Logging time must never be presented as though it were the time the expense occurred.

### Unknown transaction time treated as known

Do not infer transaction time from speech order or UI position.

### Journal date leaking into capture

Viewing September 2 must not silently cause a new capture to become a September 2 transaction.

### Editing date without regrouping

Changing a transaction's date must immediately move it to the correct day.

### Editing amount without recalculating totals

Day totals must update immediately.

### Deleting the last transaction in a day

The day should disappear from the populated journal.

### Empty-date navigation

Selecting an empty date must show a deliberate empty state.

### Missing category

Do not fabricate category information merely to make the row look complete.

### Missing description

Do not discard useful payee information simply because description is missing.

### Duplicate-looking transactions

Do not accidentally deduplicate legitimate separate transactions.

### Month/year boundary errors

Navigation and grouping must remain correct across boundaries.

---

# 31. Phase A Data / Read Model

The journal should consume the existing transaction records rather than create a parallel transaction model.

Conceptually:

```text
transactions
    ↓
retrieve relevant records
    ↓
group by transaction date
    ↓
calculate day totals
    ↓
order transactions
    ↓
render journal
```

The journal is a representation and interaction layer over the transaction records.

---

# 32. Phase A Implementation Breakdown

## A1. Journal data/read layer

Build reliable logic for:
- retrieving transactions
- grouping by transaction date
- calculating day totals
- handling known and unknown transaction times
- deterministic ordering

## A2. Journal screen

Build:
- journal header
- current/latest day state
- day sections
- day totals
- transaction rows
- basic calendar/date picker
- Today navigation
- empty-date state
- empty-journal state

Do not require continuous scrolling in Phase A.

## A3. Transaction detail

Build:
- complete transaction display
- provenance where appropriate
- logging timestamp metadata
- Edit
- Delete

## A4. Editing

Build:
- amount editing
- description editing
- category editing
- payment method editing
- date editing
- time editing
- payee editing
- validation
- regrouping
- total recalculation
- ordering updates

## A5. Capture/journal navigation

Build:

```text
Capture ↔ Journal
```

without allowing journal state to silently change capture date.

## A6. Empty/sparse capture treatment

Build UI states for:
- zero transactions
- sparse days
- populated days

The exact threshold for capture prominence should remain configurable rather than hardcoded.

## A7. Testing

Create deliberate test data for:
- one transaction on one day
- multiple transactions on one day
- multiple days
- known transaction times
- unknown transaction times
- mixed known/unknown transaction times
- missing categories
- missing descriptions
- payee-only records
- identical-looking transactions
- edited dates
- edited amounts
- edited times
- deleted transactions
- empty days
- empty journal
- month boundaries
- year boundaries

---

# 33. Phase A Acceptance Criteria

## Journal

- Transactions are grouped correctly by transaction date.
- Day totals are correct.
- Today opens as the current journal context.
- The latest available transactions are immediately visible.
- Historical dates can be reached through the basic calendar/date picker.
- Today can be reached again easily.
- Continuous scrolling is not required.

## Time

- A subtle logging time can be shown.
- The displayed logging time is clearly distinguishable from transaction time.
- `created_at` is never silently presented as the time the expense happened.
- Unknown transaction time remains unknown.
- Transaction time is not inferred from speech order.

## Rows

- Amount has strong visual weight.
- Reason/description is immediately legible.
- Payee can be represented without forcing it into description.
- Supporting metadata does not overwhelm the row.
- Missing information is not fabricated.

## Detail

- Every stored field can be inspected.
- Provenance can be understood where relevant.
- Logging time is distinguishable from transaction time.
- Every transaction can be edited.
- Every transaction can be deleted.

## Editing

- Amount edits update totals.
- Date edits move transactions between day sections.
- Time edits update ordering where relevant.
- Other field edits appear immediately.

## Empty/sparse states

- Completely empty journal has a clear first-use state.
- Empty dates have a clear state.
- Empty dates provide a more prominent route toward recording an expense.
- Capture prompting becomes quieter as a day becomes populated.
- Empty days are not rendered throughout the journal as calendar placeholders.

## Architecture

- Journal is a separate screen/mode.
- Capture remains the primary/default experience.
- Journal navigation never silently controls capture date.
- Phase A does not introduce voice navigation commands.
- Phase A does not require continuous scrolling.

---

# 34. Phase A Scope Boundary

Phase A includes the journal system and everything necessary to make it a useful, correct historical record.

Phase A does not include:
- spoken-date interpretation
- relative-date interpretation
- date ambiguity resolution through voice
- voice navigation
- "show me September 2" voice commands
- automatic journal-date inheritance by capture
- major redesign of the existing voice pipeline

The existing voice capture system should continue working while Phase A is implemented.

---

# 35. Phase B Boundary

Phase B begins only after Phase A is confirmed.

Its job is to make the existing voice interpreter understand journal-compatible temporal input.

Examples:

```text
"I paid 400 for dinner on 2 September"
"I paid 400 for dinner last Tuesday"
"I paid 400 for dinner on the 2nd"
"I paid 400 for dinner yesterday"
"I paid 400 for dinner"
```

The interpreter must distinguish:

```text
explicit date
relative date
default date
ambiguous date
unresolvable date
```

The trust rule remains:

> **If the date cannot be reliably determined, do not guess.**

The journal semantics established in Phase A become the contract that Phase B's voice system must satisfy.

---

# 36. Current Agreed Decisions

1. The journal is a separate screen from capture.
2. Capture remains the primary/home experience.
3. The journal is a historical record, not a calendar or analytics product.
4. Transactions are grouped by transaction date.
5. Journal navigation never silently changes capture date.
6. Phase A uses a basic calendar/date picker for date navigation.
7. Continuous scrolling is not a Phase A requirement.
8. The journal opens at today/latest available transactions.
9. Amount and reason/description are the two primary row-level pieces of information.
10. Amount receives strong visual emphasis, but reason must remain properly legible and meaningful.
11. Categories can be inferred and improved later.
12. Payee deserves a dedicated mini-design.
13. Transaction time and logging time are distinct.
14. A subtle time can be shown to indicate **when the user logged the transaction in VaaniTrack**, not when the expense occurred.
15. Unknown transaction time must never be inferred merely from speech order or UI position.
16. Empty days should not be rendered as calendar placeholders throughout the journal.
17. Empty days should make the voice capture action more prominent.
18. Capture prompting should become quieter as the day becomes populated.
19. The exact sparse-day threshold is not yet hardcoded.
20. Editing ships in Phase A.
21. Date editing is required in Phase A.
22. Delete requires deliberate confirmation.
23. Duplicate-looking transactions must remain separate unless explicitly deleted.
24. Provenance remains part of the transaction model and can be exposed in detail.
25. Phase B is deferred until Phase A is confirmed.

---

# 37. Next Design Work Before Phase A Is Fully Frozen

## 1. Payee mini-design

Define:
- payee semantics
- extraction
- interaction with description
- display
- correction
- uncertainty
- future voice improvements

## 2. Empty/sparse-day capture interaction

Define:
- exact CTA
- whether the CTA says "Record an expense" or "Record for [date]"
- how explicit date context is established
- how the capture screen communicates the selected date
- how the rule against silent date inheritance is preserved

## 3. Calendar/date-picker interaction

Define:
- header placement
- selected-date behavior
- empty-date behavior
- Today behavior
- month/year navigation

## 4. Final row composition

Define the exact visual relationship between:
- amount
- reason
- payee
- category
- payment method
- logging time

These should be resolved before treating the Phase A UI specification as completely frozen.

---

# 38. Product Principle to Preserve

Throughout implementation:

> **VaaniTrack should remove the friction of recording spending without removing the user's trust in what was recorded.**

The journal is where that trust becomes visible.

It should make the record:
- understandable
- honest
- navigable
- correctable
- useful as a memory of past spending

Phase B should then make the voice system capable of writing into that journal with the same level of trust.

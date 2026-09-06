# VaaniTrack Persistence + Observability Layer

## Goal

The goal of this work is **not primarily to build a better storage system**.

The goal is:

> **Create a way to observe what happens inside VaaniTrack when real people use it, so we can identify where and why it goes wrong.**

Storage is the infrastructure that makes this possible.

---

## Why This Exists

VaaniTrack's core pipeline is:

**User speaks → Audio → ASR → Transcript → Extraction → Confidence decision → Transaction → User correction**

We need visibility into the important stages of this pipeline.

When something goes wrong, we should be able to determine **where the failure happened and why**, rather than simply knowing that the final transaction was wrong.

---

## Example

User says:

> "Spent two hundred fifty on lunch"

VaaniTrack records:

> ₹2,050 lunch

The system should let us determine whether the problem came from:

1. **Audio** - the recording itself was bad.
2. **ASR** - speech was transcribed incorrectly.
3. **Extraction** - the transcript was correct but the LLM interpreted it incorrectly.
4. **Confidence gate** - the system was uncertain but auto-saved anyway.
5. **User correction** - the model output was reasonable but the user changed it.
6. **Persistence/UI** - the transaction was correct internally but was stored or displayed incorrectly.

The purpose of the observability layer is to make these distinctions visible.

---

## Mental Model

```text
             VaaniTrack
                 │
              Capture
                 │
        ┌────────┴────────┐
        ↓                 ↓
      Audio            Metadata
        │
       ASR
        │
    Transcript
        │
   Extraction
        │
  Model Output
        │
 Confidence Gate
        │
   ┌────┴─────┐
   ↓          ↓
 Saved      Review
   │          │
   └────┬─────┘
        ↓
   User Action
        │
        ↓
 Final Transaction
```

We want to record the important state at each stage.

---

## What We Need to Observe

### 1. Capture

- Capture ID
- Timestamp
- Source: voice or manual
- Audio duration
- Relevant capture metadata

### 2. ASR

- Transcript
- ASR model/version
- Relevant ASR confidence or diagnostics, where available

### 3. Extraction

- Raw model output
- Extraction model/version
- Extracted amount
- Extracted description
- Extracted category
- Extracted payee
- Extracted payment method
- Extracted date
- Extracted time
- Field provenance
- `needsConfirmation`

### 4. Confidence Decision

- Auto-saved
- Sent to review
- Rejected
- Confidence/decision information
- Reason for the decision

### 5. User Action

- Accepted
- Edited
- Undone
- Deleted
- Final transaction after correction

---

## The Most Important Data

**Do not only store the final transaction.**

A final transaction tells us what happened, but not necessarily where the system failed.

For example:

```text
RAW AUDIO
    ↓
TRANSCRIPT
"spent two fifty on lunch"
    ↓
EXTRACTOR OUTPUT
amount = 2050
    ↓
CONFIDENCE
0.91
    ↓
USER ACTION
UNDO
```

This tells us:

**ASR was probably fine → extraction was wrong → confidence gate failed to catch it.**

That is actionable.

---

## User Corrections Are Valuable

The system should capture corrections because they provide real examples of where VaaniTrack's interpretation differs from the user's intent.

Example:

User says:

> "Spent 450 at Starbucks"

Model produces:

```text
amount: 450
payee: Starbucks
description: coffee
```

User changes the description to:

```text
description: breakfast
```

That correction is useful evidence.

Over time, these corrections become a **real-world VaaniTrack failure dataset**.

This is more valuable for future model improvement than relying only on invented test cases.

---

## Failed Captures Matter

Do not collect only successful transactions.

Failed, rejected, edited, and undone captures are particularly valuable because they show where the product's trust boundary is breaking.

We need to distinguish:

- Successful captures
- Rejected captures
- Review-required captures
- Incorrect auto-saves
- User edits
- User undos
- Deleted transactions
- Persistence/display failures

---

## Diagnostic Portal

The initial portal does **not** need to be a sophisticated analytics dashboard.

Its primary purpose is:

> **"Why did this particular expense become wrong?"**

A simple capture list is enough initially.

Example:

| Time | Transcript | Extracted | Status |
|---|---|---|---|
| 10:31 | "spent 250 lunch" | ₹250 lunch | ✓ |
| 10:34 | "paid Rahul five hundred" | ₹500 Rahul | ✓ |
| 10:38 | "spent two fifty..." | ₹2,050 | ❌ |

Clicking a capture should reveal the pipeline:

```text
CAPTURE #392

Transcript
"spent two fifty on lunch"

Model output
amount: 2050
description: lunch

Confidence
0.91

User action
UNDO

Likely failure
Amount extraction
```

The portal is a **debugging microscope**, not the product itself.

---

## Local Storage vs Backend

The immediate problem is not simply:

> "localStorage is bad."

The real problem is:

> **We need durable user data and visibility into real-world behavior.**

For the current stage, localStorage can remain the local cache.

Conceptually:

```text
localStorage
     ↕
backend persistence
     ↓
observability data
     ↓
diagnostic portal
```

Do not turn this into a large authentication, sync, or cloud architecture project unless the product actually requires it.

---

## Privacy

VaaniTrack deals with financial transaction data and potentially voice/transcript data.

Therefore, observability must be designed carefully.

Avoid casually retaining raw audio for every user unless there is a clear reason, appropriate consent, security, and retention policy.

The diagnostic system should expose only the information needed to understand product failures.

The goal is to understand:

> User 8 → Capture 392 → failure

not unnecessarily expose personal financial details.

---

## Strategic Purpose

This system changes how VaaniTrack improves.

Without observability:

> "The voice model seems bad."

With observability:

> "ASR is correct, but amount extraction fails on Indian number-word phrasing."

Or:

> "Extraction is correct, but the confidence gate auto-saves cases it should send to review."

Or:

> "The model is correct, but the UI/persistence layer loses the transaction."

Each conclusion leads to a different fix.

---

## What This Is NOT

This work is **not**:

- A general analytics dashboard
- A full cloud-sync product
- A large backend rewrite
- A model-training system
- A replacement for the current transaction model
- A reason to immediately fine-tune the voice model

The purpose is to create enough visibility to make those future decisions using real evidence.

---

## Guiding Principle

> **Don't improve the model blindly. Observe the real pipeline, find the failure, then fix the failure.**

The immediate objective is therefore:

**Build the smallest persistence + observability layer that lets us see what happens when real people use VaaniTrack.**

# VaaniTrack — Complete Context

**This file is the single source of truth for understanding VaaniTrack.** It is written so that a person or an LLM can read only this and understand the product, the reasoning behind it, the architecture, the code, the current state, and what comes next — without opening another file.

Everything here reflects the codebase as of **18 September 2026**, at commit `a84cdd8`.

---

## 1. What it is, in one line

> **Say what you spent. Check it. Done.**

VaaniTrack is a voice-first expense capture app for the Indian market. You speak an expense the way you'd text it to yourself — *"250 lunch"* — and it becomes a structured transaction. Every field records whether it was **heard, worked out, defaulted, or unknown**. A journal keeps the resulting record readable and correctable.

It is a **web app** (Next.js, runs in a browser), currently for personal/single-user use with browser-local storage.

---

## 2. The problem

There is no shortage of expense tracking apps. **People are not blocked by a lack of tools — they quit because logging is too much work.**

At the moment of spending, a typical app asks you to: open it, find the right category, type an amount, pick a payment method, pick a date, save. The cost of any one entry is small. It repeats several times a day, every day, and accumulates until the person stops.

**What people actually do instead:** the author's own workaround was sending himself a WhatsApp message that said `250 lunch`. People think in compressed, conversational fragments. They do not think *"Create an expense. Amount = 250. Category = food. Payment method = …"*

### Pain points being addressed

| Pain | Evidence status |
|---|---|
| Too many fields for one small expense | Observation |
| Category selection forces a decision the user hasn't made | Observation |
| Repeating the same payment method and date every time | Observation |
| Effort paid *now*, benefit arrives *later*, so the habit decays | Assumption |

### The target user

**Someone who has tried an expense app before and quit.** The core hypothesis: people abandon expense tracking because of per-transaction friction; removing that friction makes the habit sustainable.

### The narrow question the product is testing

> Can we make recording an expense so frictionless that people actually keep doing it?

---

## 3. The governing principle

> ### Never record a wrong transaction.

**Capture speed is subordinate to correctness.** A confidently recorded wrong amount or date damages trust more than asking one extra question.

This single principle explains most of the design decisions in this codebase. When something looks over-engineered — the provenance system, the confidence gate, the hallucination denylist, the refusal to guess a category — it exists to serve this rule.

A supporting principle, from the product docs:

> VaaniTrack should remove the friction of recording spending **without removing the user's trust in what was recorded.** The journal is where that trust becomes visible.

---

## 4. What this product is NOT

Deliberately out of scope:

investment tracking · stock portfolio management · wealth management · budgeting systems · financial dashboards · advanced analytics · debt management · lending and borrowing · Splitwise-style settlement · broad financial aggregation · multilingual support in v1 · complicated expense grouping

The product deliberately occupies only the **capture** layer of personal finance, not the analysis or planning layers.

---

## 5. The central engineering fact

This one research finding shapes the entire technical architecture:

| Category | Baseline ASR | Fine-tuned | LLM cascade |
|---|---|---|---|
| Years | 97.4% | 97.7% | — |
| Quantities | 93.3% | 99.4% | — |
| **Currency amounts** | **36.3%** | **98.5%** | **95.6%** |
| Timestamps | 3.4% | 75.9% | 83.8% |

**Speech recognition is worst at exactly the field that matters most.** Raw ASR gets currency amounts right only 36.3% of the time — the lowest of any category the app actually depends on. (Timestamps score lower still, at 3.4%; that finding gets its own consequence below.)

**This is why the app is a two-stage cascade** rather than plain speech-to-text: transcribe first, then have an LLM interpret the financial meaning. That path reaches 95.6% on amounts. The 98.5% in the middle column is the *fine-tuning* route, which this project did not take — so 95.6% is the number this architecture can claim.

A useful side-finding: timestamps score **3.4%** at baseline — the worst number in the table. This independently justifies the decision to treat time as optional and never infer it.

Whisper was the best-performing model tested at **11.2% WER** on real-world use cases. Note that industry-wide, WER rises to **30–50% for accented speech** versus 2–8% for native speakers — directly relevant for Indian English.

---

## 6. How the app works (user's view)

**Once, before the first recording:** a single question asking whether recordings may be kept, with no pre-ticked box. Answering no changes nothing about how the app works (§14).

### Capture screen (`/`)

1. Press the waveform button and speak: *"250 lunch"* — the button waits until the microphone is actually carrying sound before it says "Tap to finish" (§10)
2. Audio → transcription → structured transaction
3. **If confident:** saved immediately, with a green "Logged ₹250 lunch" banner and an **Undo** button
4. **If uncertain:** a review card appears asking you to check before it saves
5. A typed input (`…or type it: 250 lunch`) does the same thing without the microphone — this is a first-class path, not a fallback
6. Below: **Today's** transactions only, with a running total

### Journal screen (`/journal`)

Two states of one screen:

- **Browse** (default): every day that has transactions, newest first, with a bright month rule and monthly subtotal each time the scroll crosses into a new month
- **Day**: one chosen date, reached through the date picker

Within a day, transactions with a known spoken time form a chronology; transactions with unknown time sit in a separate group below, labelled **"Time not recorded"**.

Tapping any row opens a full-screen detail view showing every stored field with its provenance, plus edit and delete.

A quiet `+ Log an expense` button on a chosen day opens a **sheet** with the microphone, which records onto **that day**, not today.

---

## 7. Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Browser (phone or laptop)                               │
│                                                          │
│  /            capture screen                             │
│  /journal     the record                                 │
│  /portal      diagnostic portal (password-gated)         │
│  /diag        diagnostics  ·  /diag/mic  signal test     │
│                                                          │
│  MediaRecorder ──▶ audio blob                            │
│  AudioContext  ──▶ dBFS level  (is there sound at all?)  │
│  localStorage  ◀─▶ transactions, device id, consent      │
└────────────────────────┬─────────────────────────────────┘
                         │
          ┌──────────────┴───────────────┐
          ▼                              ▼
┌──────────────────────┐      ┌──────────────────────────┐
│ POST /api/transcribe │      │ POST /api/extract        │
│                      │      │                          │
│ Groq                 │      │ Groq                     │
│ whisper-large-v3     │─────▶│ openai/gpt-oss-120b      │
│                      │ text │                          │
│ → text + confidence  │      │ → structured JSON        │
│ → captureId          │      │                          │
└──────────┬───────────┘      └───────────┬──────────────┘
           │                              │
           │   POST /api/observe ◀────────┼──── gate verdict,
           │   (fire-and-forget)          │     user actions,
           ▼                              ▼     transaction mirror
┌──────────────────────────────────────────────────────────┐
│  Supabase — OPTIONAL, never load-bearing                  │
│                                                          │
│  Postgres   captures · capture_transactions ·            │
│             capture_events · transactions                │
│  Storage    consented audio, 90-day expiry               │
└──────────────────────────────────────────────────────────┘
```

**Stage 1 (`/api/transcribe`)** turns audio into words and reports how sure it is.
**Stage 2 (`/api/extract`)** turns words into a transaction. **The prompt in stage 2 is the product** — it is where the 36.3% → 95.6% improvement actually happens.

**`/api/observe`** is the third endpoint, and it is not part of the pipeline. The gate decision and every user action happen in the browser *after* both API calls have returned, so they cannot be captured server-side and are reported back deliberately. It **always answers 200**. Nothing on the capture path awaits it.

### Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js **16.3.4** (App Router, Turbopack) |
| UI | React **19.2.8**, TypeScript |
| Styling | Tailwind CSS **v4** (CSS-first config in `globals.css`) |
| Transcription | Groq — `whisper-large-v3` |
| Extraction | Groq — `openai/gpt-oss-120b` (override via `GROQ_MODEL`) |
| Working store | Browser `localStorage`, key `vaanitrack.transactions` |
| Durable store | Supabase Postgres via `postgres@^3`, raw SQL — **optional** |
| Audio retention | Supabase Storage, consent-gated, 90 days — **optional** |
| Audio | Browser `MediaRecorder` + `AudioContext` level metering |
| Phone testing | Cloudflare quick tunnel (`cloudflared`) + QR code |

**Only one secret is needed to capture:** `GROQ_API_KEY` in `.env.local`. It covers both models. The five Supabase and portal variables are optional; without them the app behaves identically and simply runs unobserved.

**There is still no auth and no cross-device sync.** `localStorage` remains the working copy the UI reads and writes; Postgres is a mirror keyed by an anonymous per-browser device id. A second device is a different id and sees nothing. See §14.

---

## 8. The data model — provenance is the core idea

This is the most important concept in the codebase. Every field stores **not just a value, but where the value came from.**

```ts
type Provenance = "said" | "inferred" | "default" | "unknown";

interface Field<T> {
  value: T | null;
  provenance: Provenance;
}
```

| Provenance | Meaning | Shown to user as |
|---|---|---|
| `said` | Stated outright by the user | "You said this" |
| `inferred` | Worked out confidently by the model | "Worked out" |
| `default` | The app supplied it | "Your default" |
| `unknown` | Not available — **value must be `null`** | "Not captured" |

### The Transaction

```ts
interface Transaction {
  id: string;
  amount:        Field<number>;
  description:   Field<string>;
  category:      Field<string>;   // nullable by decision — never guessed
  payee:         Field<string>;   // a person, e.g. "Paid 500 to Rahul"
  paymentMethod: Field<string>;
  date:          Field<string>;   // ISO YYYY-MM-DD
  time:          Field<string>;   // only if explicitly spoken, never inferred
  createdAt:     string;          // ISO timestamp — when the RECORD was made
  source:        "voice" | "manual";
  transcript?:   string;          // raw words this came from
}
```

**Defaults (hard-coded, no settings screen in v1):** `paymentMethod: "UPI"`, `currency: "₹"`.

### Why provenance exists

Because the review card, and later the detail view, must be able to answer: *did I say this, or did the app decide it?* Without that, the user cannot tell a recorded fact from a system guess — and the whole trust argument collapses.

**A blank beats a guess.** An empty category is a legitimate, correct outcome. The extractor is explicitly forbidden from writing "other" or "misc" just to avoid a null.

---

## 9. The extraction prompt (stage 2)

The full rule set given to `gpt-oss-120b`, and why each exists:

1. **Never invent.** Not said and not confidently inferable → `null` + `"unknown"`.
2. **Defaults only when unstated:** paymentMethod `UPI`, date today, both marked `"default"`. Anything stated overrides as `"said"`.
3. **Category:** infer only when obvious (lunch/chai → food, auto/uber → transport). Otherwise `null`. Never "other"/"misc".
4. **Time:** `null` + `"unknown"` unless a clock time was actually spoken. **Never "now".**
5. **Several expenses → several entries.** Never merge.
6. **Self-correction in one utterance → one entry with the final value.** *"250, no wait 280"* → 280.
7. **Explicit payment verb + person** (paid/gave/sent) → record normally. *"Paid 500 to Rahul"* → payee Rahul, no confirmation.
8. **`needsConfirmation` only for genuine ambiguity.** Chiefly a bare amount + person with **no verb** — *"250 to Pushpa"*: paid? lent? owed? A missing category is **not** a reason. An unreadable amount **is**.
9. **Amounts:** `"two fifty"`=250, `"dhai sau"`=250, `"fifteen hundred"`=1500, `"1.5k"`=1500, `"ek lakh"`=100000.
10. **Currency artifacts.** Everything is rupees. A `$` is **always** a transcription error. Speech-to-text writes spoken Indian amounts in dollar form: `$2.50`→250, `$15.00`→1500. Paise aren't used in practice, so a trailing `.50` is a misheard "fifty", not a fraction.

Rule 10 is a real bug fix, not theory — it came from watching the transcriber turn *"two fifty"* into `$2.50`.

---

## 10. Trust mechanisms in the capture and transcription stages

Stage 1 does more than call Whisper. It defends against the specific ways Whisper fails — and, since 6 September, against the ways the **microphone** fails before Whisper ever sees anything.

### Before the transcriber: does the recording contain sound?

This exists because a handset produced recordings of a normal length and a normal byte count containing **no voice at all** — one 11.8 KB, 1.3-second clip measured −77 to −103 dBFS end to end. Whisper answered it *"Thank you."*

**Byte count cannot detect this.** Opus is encoded here at a fixed target bitrate, so silence costs exactly as many bytes as speech. Only the browser holds the PCM, so only the browser can measure it.

| Guard | Threshold | Why |
|---|---|---|
| **Warm-up wait** | level > **−66 dBFS**, giving up after 1200 ms | The audio track delivers digital zeros for up to 1.44 s after `getUserMedia` resolves. The button used to say "Tap to finish" during that window, so the amount was spoken into a dead stream. The recorder now holds a `warming` state until sound actually arrives. |
| **Silence refusal** | peak < **−55 dBFS** | Refused on the device, naming the causes worth checking, rather than being paid for and returned as an invented expense. |

Both guards **stand down when the `AudioContext` is not `running`** — a suspended context reports zeros about the meter, not about the microphone, and must never be allowed to reject a good recording. Peak, mean and warm-up time are recorded per capture, because the warm-up varies run to run on one device and only a distribution shows whether the wait is working.

### The transcriber's own defences

**Decoder prompt, chosen by experiment:**

```
"Amounts in Indian rupees: 250, 120, 1500, 300."
```

Transcribing the same recording of *"two fifty lunch"*:

| Prompt | Result |
|---|---|
| No prompt | `" 2.50 lunch."` |
| Vocabulary words only | `" $2.50 lunch"` (worse) |
| **Rupee-formatted amounts** | `" 250 lunch."` ✅ |

**Rejection thresholds:**
- `NO_SPEECH_PROB_MAX = 0.6` — segments the model doubts this much are treated as silence
- `AVG_LOGPROB_MIN = -1.0` — segments below this are discarded

**Hallucination denylist.** Given quiet or unclear audio, Whisper doesn't return nothing — it returns confident-looking stock phrases. Observed on a real device: three seconds of *"two fifty lunch"* came back as *"Hello, how are you?"*. Known stock phrases (including *"Subtitles by the Amara.org community"*) are matched exactly after normalisation, so a genuine *"250 for a thank you gift"* is untouched.

---

## 11. The confidence gate

The decision of whether to save silently or ask the user. Located in `useCapture.ts`.

```ts
const heardWell = (confidence ?? 0) > -0.9;   // mean avg_logprob from Whisper

const confident = (row) =>
  heardWell &&                          // the audio itself was clear
  !row.needsConfirmation &&             // the extractor didn't flag ambiguity
  row.amount !== null &&
  row.amountProvenance === "said";      // the amount was HEARD, not inferred
```

All four conditions must hold. **The amount is the one field that must never be silently wrong**, so anything short of `"said"` earns a review card instead of a save.

The `-0.9` threshold is calibrated, not arbitrary: a known-good transcript (*"250 lunch."*) scores `-0.64`, so the threshold sits below that. It is deliberately generous — it exists to catch audio that was largely guessed at, not to second-guess good captures.

> **A divergence worth recording.** `RESEARCH.md` §3 advises *against* this approach: it found mean log-probability a weak predictor of correctness (0.705 ROC AUC) and recommended **self-consistency** instead — parse the same utterance twice and check the two results agree. The gate uses `avg_logprob` anyway. The reason is cost and latency: self-consistency doubles both on every capture, and the gate is not being asked to grade the transcript, only to spot audio that was largely guessed at, where the signal is strong enough. It is a deliberate trade, not an oversight, and if amount accuracy ever disappoints in real use this is the first thing to revisit.

**Auto-saving is only acceptable because undo is trivial.** Every auto-logged entry announces itself with an Undo button.

**Every verdict is recorded, naming which conditions failed** — `audio_unclear`, `extractor_flagged_ambiguous`, and so on — not merely that the capture went to review. This is what makes the threshold above adjustable on evidence instead of instinct. An auto-save the user immediately undoes is the single worst outcome the product has, and the portal surfaces it as its own verdict (§15).

---

## 12. The journal — semantics and rules

The journal (built as "Phase A") is where the recorded data becomes a trustworthy, correctable history.

### Two time concepts, never conflated

| Concept | Field | Meaning |
|---|---|---|
| **Transaction time** | `date`, `time` | When the money was spent |
| **Logging time** | `createdAt` | When the app wrote it down |

Grouping **always** follows `date`, never `createdAt`. There is a unit test asserting exactly this, because getting it wrong renders a transaction on the wrong day and is invisible until someone notices.

When a transaction was logged on a different day than it happened, the UI says so: **"logged 6 Sep, 9:40 PM"** rather than a bare time that would read as a claim about when the spending occurred.

### The ordering rule (the subtlest thing in the codebase)

Within a day:
- Transactions **with a known spoken time** form a chronology
- Transactions **without** sit in a separate group below, labelled **"Time not recorded"**

**Nothing untimed is ever placed between two known times.** If you have a 10:30 AM and a 1:15 PM entry, an untimed coffee must not land between them — its position would read as a claim about when it happened, which is exactly what nobody knows. Speech order is not evidence: saying "coffee" after "lunch" doesn't mean it was bought later.

There is a dedicated test for this case.

### Month grouping

The headline figure is **this calendar month**, not all-time. A running all-time total grows without meaning; a month is the cycle rent and salary land on. Undated transactions get their own **"No date"** section at the end, never folded into a month they don't belong to.

### Editing rules

- A value the user **types becomes provenance `"said"`** (it was explicitly provided)
- Untouched fields **keep their original provenance**, so the detail view stays truthful about what the app supplied
- **Future dates are rejected** — the product records money already spent; the date input is capped at today
- Delete sits behind one deliberate confirmation

### The capture/journal separation rule

This one was decided, reversed, then refined:

- The journal's viewed date **must never silently** become a capture date
- But an **explicit** record button on a specific day's own screen is fine — the user chose that day deliberately
- **A spoken date always outranks the viewed date.** Recording *"250 lunch"* while viewing 2 September files it there; saying *"250 lunch yesterday"* files it to yesterday.

> Position is context. Speech is evidence. Evidence wins.

---

## 13. Design language

Derived from a Wispr Flow style reference; documented in `DESIGN.md`.

**Colors**

| Token | Hex | Use |
|---|---|---|
| `--color-paper` | `#f0ede7` | Page canvas |
| `--color-paper-raised` | `#f9f7f3` | Cards, header |
| `--color-paper-edge` | `#ddd7cb` | Dividers, disabled |
| `--color-vast-ink` | `#1a1a1a` | Text, borders, "dark chambers" |
| `--color-charcoal` | `#222222` | Secondary text |
| `--color-fog` | `#8a857c` | Tertiary text |
| `--color-forest-ink` | `#034f46` | Accent, active states |
| `--color-mint-whisper` | `#cfead9` | Primary buttons |
| `--color-mint-deep` | `#aeddc6` | Pressed state |
| `--color-ember-glow` | `#ffa946` | Errors, warnings |

**Typography** — EB Garamond for display/editorial headings (`.display-type`), Figtree for all body and UI text. Type scale runs `--text-caption` 14px → `--text-heading-lg` 64px.

**Shape** — oversized radii are the signature: `--radius-card` 32px, `--radius-chamber` 40px, `--radius-chamber-lg` 80px, `--radius-pill` 9999px.

**The "dark chamber"** — a near-black inset panel with an oversized corner radius, bookended by paper canvas. The light/dark alternation gives the page its rhythm; two light panels in a row would flatten it.

**Motion** — `.rise` (240ms, 8px lift) for banners, `.sheet-rise` (260ms, full-height travel) for sheets, `.veil-in` for backdrops. All disabled under `prefers-reduced-motion`.

**Navigation philosophy** — Capture is the app's *verb*, Journal its *noun*. There is deliberately **no bottom tab bar**: a two-tab bar framed them as equal peers. Capture is full-bleed with no competing chrome; the Journal is reached by a quiet header link and a thumb-reachable link under Today's list.

---

## 14. The observability layer

Added 6 September, and it displaced Phase B in the roadmap. The reason is a question the project could not answer:

> **When an expense comes out wrong, which stage broke?**

The pipeline is `audio → ASR → transcript → extraction → gate → user action`. Storing only the final transaction says *what* happened and never *where it went wrong*. Every accuracy decision after this point — a prompt change, a threshold move, a model swap — is a guess until the stages can be blamed independently.

### The rule that governs all of it

> **Diagnostics must never take down the capture path.**

Every function in `src/lib/observe.ts` swallows its own errors and returns a degraded-but-safe value. `/api/observe` always answers 200. The client's `report.ts` is fire-and-forget and nothing awaits it. **A missing row costs a data point; a thrown error costs the user their transaction.** With `DATABASE_URL` unset, the whole layer disables itself and capture is unchanged.

### The four tables

`supabase/schema.sql`, then `002`–`004` in order.

| Table | One row per | Key columns |
|---|---|---|
| `captures` | Utterance, spoken or typed | `transcript`, `asr_verdict`, `avg_logprob`, `no_speech_prob`, `audio_peak_db`, `audio_mean_db`, `audio_warmup_ms`, `extract_raw` |
| `capture_transactions` | Transaction extracted from a capture | `extracted`, `gate_outcome`, `gate_failed` |
| `capture_events` | Thing the user did afterwards | `action`, `before_state`, `after_state`, `changed_fields` |
| `transactions` | Transaction in the journal | `data`, `amount`, `txn_date`, `deleted_at` |

**Three design points worth preserving:**

1. **One utterance can yield several transactions** (extraction rule 5 splits *"250 lunch and 80 chai"*), so the gate verdict cannot be a column on `captures`.
2. **`gate_failed` names conditions, not a score.** The gate is four independent checks. *"It went to review"* is not actionable; *"the amount was inferred rather than heard"* tells you whether to look at the transcriber, the prompt, or the threshold.
3. **`before_state` exists because undo, edit and delete destroy the evidence** in the app's own storage. Without it a correction can be seen but not compared against what the model proposed — which is the entire value of a correction.

**Rejections are recorded too.** They mark where the trust boundary sits, and were previously invisible.

### Security posture

RLS is **on with no policies** on every table — deny by default. All writes happen server-side with `SUPABASE_SECRET_KEY`, which bypasses RLS. If the publishable key ever reaches client code by accident, none of it is readable. One privileged path, everything else closed.

### Identity, and what it is not

`src/lib/device.ts` generates a random UUID once per browser and keeps it in `localStorage`. It carries no personal information and resets when site data is cleared.

Its purpose: **telling ten failures by one person apart from one failure by ten people**, which is usually the question that matters. It is deliberately not an account — the brief warns against turning this into an authentication project, and durability alone was what was actually missing.

### Audio retention and consent

One question, asked once before the first recording, mounted in the root layout because the journal can record too. No pre-ticked box, no default; "No" is as easy to press as "Yes".

**Answering no is not a degraded mode.** The app works identically — it still records expenses, still shows transcripts, still logs what the pipeline did. The only difference is whether the recording itself is kept. Consented clips expire after **90 days**: long enough to span several prompt and model iterations, short enough to remain a policy rather than a hoard.

---

## 15. The diagnostic portal

`/portal` — the read side, and the most sensitive surface in the product, because it shows transcripts and amounts.

**Access:** one operator, one `PORTAL_PASSWORD`, one hashed httpOnly cookie, compared with `timingSafeEqual`. **An unset password denies everyone** rather than letting the page fall open — a missing environment variable in production must fail closed. Deliberately not an auth system; if VaaniTrack ever gains real accounts this gets replaced wholesale rather than extended.

**The list view** shows the last 100 captures with a **likely-failure verdict** — labelled on screen as a heuristic, because it narrows the search rather than closing the case. Its ordering matters: *a stage can only be blamed once everything upstream of it is known to have worked.*

| Verdict | Reached when |
|---|---|
| Mic sent silence — nothing reached the page | peak < −55 dBFS |
| Mic far too quiet | peak < −40 dBFS |
| Mic hardware — recorded silence, not a short tap | under 1 byte/ms across more than 1200 ms |
| Recording too short — mis-tap | small and brief |
| ASR — returned a stock hallucination | denylist hit |
| Extraction — … | extractor errored |
| **Gate — auto-saved something wrong** | the user undid an auto-save |
| Extraction — proposal rejected / user corrected a field | discarded or edited |
| Sent to review / Clean | — |

**"Gate — auto-saved something wrong" is the worst outcome the product has**: the gate was confident and wrong. It is the one verdict that indicts the governing principle directly.

**The detail view** reconstructs one capture as a pipeline — audio metrics, ASR result, raw extractor output, gate verdict per transaction, then the event trail.

`/diag/mic` is the companion: it runs the same utterance through three `getUserMedia` configurations and prints the dBFS that arrived. Android routes capture through the platform voice-communication path by default, and **whether that path works is a property of the handset**, so it must be measured on the handset.

> **A caution learned the hard way.** `/diag/mic` records a fixed four seconds, so human reaction time after "SAY NOW" steps over the microphone's dead lead-in. It passed at −5.1, −8.2 and −4.9 dBFS while real captures were silent. **A diagnostic that differs from the real path in any way can pass while the real path fails.**

---

## 16. File map

```
src/
  app/
    page.tsx              Capture screen. Today's transactions only.
    layout.tsx            Root layout, fonts, metadata, consent gate
    globals.css           Tailwind v4 config, design tokens, animations
    journal/page.tsx      Journal — browse + day states, month sections
    portal/page.tsx       Diagnostic portal — capture list + pipeline view
    diag/page.tsx         Diagnostics page
    diag/mic/page.tsx     Microphone signal test, three mic configurations
    api/
      transcribe/route.ts Stage 1 — audio → text + confidence, writes capture
      extract/route.ts    Stage 2 — text → structured transaction
      observe/route.ts    Client-side reporting sink. Always 200.
      portal/route.ts     Portal password → session cookie

  components/
    WaveformButton.tsx    The record button with live level visualisation
    ReviewCard.tsx        "Check this before it's saved"
    TransactionList.tsx   Today's list on the capture screen
    TransactionRow.tsx    A single row in the journal, built for scanning
    TransactionDetail.tsx Full-screen inspect / edit / delete
    DatePicker.tsx        Month grid, marks populated days, blocks future
    DayCapture.tsx        The sheet that records onto a chosen day
    AudioConsent.tsx      The one question, asked once, before any recording
    PortalLogin.tsx       Password form for /portal

  lib/
    types.ts              Transaction, Field, Provenance, localStorage
    useCapture.ts         THE capture pipeline — shared by both screens
    useRecorder.ts        MediaRecorder + level meter + warm-up gate
    journal.ts            Grouping, time semantics, date helpers
    observe.ts            Server-side observability. Never throws.
    report.ts             Client-side fire-and-forget reporting
    device.ts             Anonymous device id + audio consent
    portalAuth.ts         Portal password hashing, fails closed

supabase/
  schema.sql              captures, capture_transactions, capture_events
  002_transactions.sql    Transaction mirror + consent/expiry columns
  003_levels.sql          audio_peak_db, audio_mean_db
  004_warmup.sql          audio_warmup_ms

scripts/
  journal.test.ts         34 assertions, no test framework
  observe.smoke.ts        Writes a full pipeline's rows, reads back, deletes
  dev-tunnel.mjs          Cloudflare tunnel + QR code
  dev-https.mjs           Self-signed HTTPS alternative

start-vaanitrack.bat      One-click morning startup (Windows)
```

### The most important files to read first

1. **`src/lib/types.ts`** — the provenance model everything else serves
2. **`src/app/api/extract/route.ts`** — the prompt, which is the actual product
3. **`src/lib/useCapture.ts`** — the pipeline and the confidence gate
4. **`src/lib/journal.ts`** — the time and grouping semantics
5. **`src/lib/observe.ts`** — the observability contract, and why it never throws

`useCapture.ts` exists so both the capture screen and the journal's day-sheet share **identical** capture behaviour, differing only in which date a capture lands on. Duplicating it would let the two paths drift.

---

## 17. Running it

```bash
npm install
```

Copy `.env.local.example` to `.env.local`. **One variable is required:**

```
GROQ_API_KEY=gsk_...        # free at console.groq.com
```

Everything else is optional. Without it, capture runs unobserved and `/portal` denies everyone:

```
DATABASE_URL=               # Supavisor TRANSACTION pooler, not the direct host
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SECRET_KEY=        # sb_secret_… — server only, bypasses RLS
PORTAL_PASSWORD=            # unset ⇒ /portal denies everyone
SAVE_CAPTURES=0             # local .captures/ files; DEFAULTS TO ON if unset
```

To enable the layer, apply the SQL in `supabase/` in order and create a `captures` storage bucket.

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev at `localhost:3000` (mic works — localhost is a secure origin) |
| `npm run build` / `npm start` | Production build |
| `npm run dev:tunnel` | **Phone testing** — production build + public HTTPS tunnel + QR code |
| `npm run dev:tunnel:hot` | Same, but hot reload instead of a build |
| `node --experimental-strip-types scripts/journal.test.ts` | The data-layer test suite |
| `node --env-file=.env.local --experimental-strip-types scripts/observe.smoke.ts` | Round-trips one pipeline's rows through Supabase, then deletes them |
| `start-vaanitrack.bat` | Windows one-click: clears stale processes, checks deps and API key, builds, tunnels |

### Why a tunnel is needed for phone testing

Browsers only grant microphone access on a **secure context**. A self-signed certificate is not enough — Chrome refuses `getUserMedia` even after you tap through the warning. A Cloudflare tunnel gives a genuinely trusted certificate, so the phone gets the microphone with no certificate to install.

---

## 18. Current state (18 September 2026)

**Working:**
- Voice capture with the two-stage cascade
- Typed capture as a first-class path
- Device-side signal guards: warm-up wait and silence refusal
- Confidence gating, review cards, undo
- The journal: day grouping, month subtotals, time semantics, date picker
- Transaction detail with provenance display, editing, deletion
- Recording onto a chosen past day from the journal
- **Full pipeline observability** — every stage recorded, rejections included
- **Durable transaction mirror**, device-scoped
- **Consent-gated audio retention**, 90-day expiry
- **`/portal`** with per-capture pipeline reconstruction and failure heuristics
- **`/diag/mic`** for handset-level microphone diagnosis
- 34 passing data-layer assertions; TypeScript clean

**Repository:** `github.com/PranavChhajed/VaaniTrack` (private). **12 commits**, HEAD `a84cdd8`. `.env.local` is gitignored and verified absent from the remote.

**Not yet done:**
- The formal Phase A acceptance pass on a real phone — the 36 bullets in `VAANITRACK_PHASE_A_JOURNAL_CONTEXT.md` §33. **One of them has to be adjudicated before it can be signed off:** the spec asks that *"Today opens as the current journal context"*, but the journal ships opening on the browse state — every populated day, newest first. The spirit of the bullet (the latest transactions are immediately visible) is satisfied; its letter is not. Decide which was meant before running the pass, not during it
- **Vercel deployment.** The environment is prepared in `.env.vercel` and `DATABASE_URL` already points at the pooler for it, but nothing is deployed
- Sustained real-world usage by the author
- Phase B — spoken dates

**The iQOO hackathon has ended.** It ran in Chennai on 12–13 September and is no longer a driver of this codebase. `IQOO-HACKATHON.md` is kept as the record of that plan — note that it targeted a **separate native Android application**, so none of the features it lists were ever scoped to this repo. One finding from it does carry forward, and is recorded in §20.

**No code has changed since 6 September**, and the last capture on disk is from that morning — so the "sustained real-world usage" item above is still genuinely untested.

---

## 19. Known limitations and gotchas

**The 90-day audio deletion is promised but not enforced.** The consent dialog tells the user, in as many words, *"Recordings are deleted after 90 days"* (`AudioConsent.tsx:60`). `AUDIO_RETENTION_DAYS = 90` is set, `audio_expires_at` is written onto every stored capture, and the column is indexed for exactly this purpose — **but nothing reads it.** There is no purge job, no cron, no scheduled function anywhere in the repo. The first consented recording was stored on 6 September 2026, so the promise comes due around **5 December 2026**. Until a purge exists this is an unkept commitment to a user about their own voice, which puts it in a different category from the other items on this list.

**`localStorage` is still the working store.** The UI reads and writes it; Postgres is a mirror, not a source. The mirror gives durability against a cleared browser — but it is **keyed by an anonymous device id that clearing site data also destroys**, so recovery is not automatic, and a second device is simply a different id. **There is still no sync and no accounts.**

**The observability layer is optional by design, which cuts both ways.** With `DATABASE_URL` unset everything still works and nothing is recorded — including the diagnostics you would want the moment something goes wrong. Silence from the layer is not evidence of health.

**`SAVE_CAPTURES` defaults to ON.** Unset, the transcribe route writes a `.webm` and a `.json` per capture to `.captures/` on local disk. It predates consent and is **not consent-gated**. Set it to `0` anywhere deployed; on Vercel it silently no-ops against the ephemeral filesystem.

**A microphone can report success and deliver silence.** Some Android handsets deliver digital zeros for up to 1.44 s after `getUserMedia` resolves, and on some the platform voice-communication path delivers a flat noise floor throughout. **Opus's fixed bitrate means byte count, duration and bytes-per-ms all look healthy.** The warm-up wait and the −55 dBFS refusal address this; `/diag/mic` diagnoses what remains.

**Cloudflare quick tunnels are a coin flip.** Each run gets a random hostname, and some ISP DNS resolvers (Airtel observed) return `NXDOMAIN` for them — the link then fails on every device on that network while appearing fine elsewhere. Two real bugs in `dev-tunnel.mjs`:
1. The `printed` flag latches on the first hostname, so if `cloudflared` reconnects with a new one, the script never tells you
2. Nothing verifies that *your* resolver can see the hostname before printing it

The durable fix is deploying to Vercel, which removes tunnels entirely.

**Verifying a URL from a different network path proves nothing.** A tool whose network egress differs from the user's machine will happily report HTTP 200 for a hostname the user's browser cannot resolve. Always verify from the same resolver the user's browser uses.

**No auth, no multi-user.** The portal password is one shared operator secret, not an account system.

**English only in v1.** Hindi-English amount words (*"dhai sau"*, *"ek lakh"*) are handled in the extraction prompt, but the interface and general speech handling are English. Tamil is scoped for the hackathon build, not for this codebase.

---

## 20. Roadmap

### Phase B — spoken dates (next)

The next work on this codebase. Phase C displaced it; it did not replace it.

```
"I paid 400 for dinner on 2 September"
"I paid 400 for dinner last Tuesday"
"I paid 400 for dinner on the 2nd"
"I paid 400 for dinner yesterday"
```

It must distinguish: **explicit date · relative date · default date · ambiguous date · unresolvable date**.

The trust rule carries over unchanged:

> **If the date cannot be reliably determined, do not guess.**

A decision already made: **a spoken date more than 14 days back must be confirmed first.**

The Phase A journal semantics are the contract Phase B must satisfy — and the observability layer now means Phase B's accuracy can actually be measured rather than estimated.

### Also outstanding

- **Enforce the 90-day audio retention.** The app promises deletion; nothing deletes. See §19 — this is a commitment, not a feature, and it comes due around 5 December 2026
- **Run the Phase A acceptance pass** — §33's 36 bullets, never formally run. One of them needs adjudicating first; see §18
- **Run the 100-case accuracy corpus** — prepared, never executed. Its date cases are Phase B's acceptance harness

### Beyond

- **Deploy to Vercel** (Phase C6) — permanent HTTPS URL, no tunnel, no laptop dependency. Environment already prepared
- **PWA** — manifest + service worker makes it installable (days of work)
- **Native wrapper** — Capacitor for app stores (weeks, not months) if warranted

**One finding worth keeping from the hackathon work**, because it outlives the event and would otherwise be lost when `IQOO-HACKATHON.md` is read as history:

> **Bank-SMS reconciliation cannot be delivered from this codebase.** Reading the bank and UPI message feed needs native SMS permissions, which a web app and a PWA cannot obtain. If that capability is ever wanted — and the argument for it is strong, since the UPI feed is the one record of spending the user never has to type — it requires a native Android shell. That makes the PWA and native-wrapper items above a real fork rather than two routes to the same place.

A related note: Capacitor-wrapping this app was considered during that planning and rejected — but rejected **only** because carrying in an existing app would have failed the hackathon's originality rule. That reason expired with the event. Technically it remains open.

---

## 21. Other documents

This file is meant to be sufficient. These hold the deeper detail. All of them live alongside this file in `docs/`, except `README.md`, which stays at the repo root by convention.

| File | Contains |
|---|---|
| `PRD-VaaniTrack.md` | Full product requirements, FR-numbered, with claims tagged FACT / OBSERVATION / ASSUMPTION / DECISION. Frozen as the pre-build record |
| `RESEARCH.md` | ASR accuracy evidence, model comparisons, the numbers in §5 |
| `TechStack.md` | Running inventory of what the project actually uses, with a change log and the reasoning for what is deliberately *not* used |
| `vaanitrack_persistence_observability.md` | The brief §14 was built from — why observability, what to record, what it must not become |
| `IQOO-HACKATHON.md` | The Chennai hackathon plan, now a closed-out historical record — see §18 and §20 |
| `VAANITRACK_PHASE_A_JOURNAL_CONTEXT.md` | The journal specification, written before the build. §32 is the A1–A7 implementation breakdown; **§33 is the 36-bullet acceptance checklist**, never formally run |
| `DESIGN.md` | VaaniTrack's design language — tokens, the nine components, recorder states, provenance styling |
| `WISPR-FLOW-REFERENCE.md` | The outside style reference the early design borrowed from. Not a VaaniTrack document; kept because `globals.css` cites it when recording where the app deliberately departed |
| `EXECUTION.md` | Build log. Append-only; the silent-microphone arc is the most instructive entry |
| `voice_transaction_100_test_cases.md` | The accuracy test corpus — 120 cases, 92 currently executable |
| `README.md` | Setup and run instructions. At the repo root, not in `docs/` |

**Retired, 18 September 2026:** `IDEA.md`, `ITERATION-1.md`, `ITERATION-2.md`, `Product Idea Context for Claude.md`, and `transaction-journal-product-document.md` — early ideation and planning docs whose thinking is fully carried forward into the PRD and the formal specs above. Nothing in them was load-bearing; they remain in git history if the original phrasing is ever needed.

---

## 22. If you change this code, preserve these

1. **Never record a wrong transaction.** Ask rather than guess.
2. **A blank beats a guess.** `null` + `"unknown"` is a correct, honest outcome.
3. **The amount must never be silently wrong.** Anything short of `"said"` gets reviewed.
4. **Never conflate transaction time with logging time.**
5. **Never place an untimed transaction inside a day's chronology.**
6. **Group by transaction date, never by `createdAt`.**
7. **A spoken date outranks the viewed date.**
8. **Auto-save only stays acceptable while undo is trivial.**
9. **Provenance belongs in the detail view** — on a row it's noise; on the detail it answers the question a financial record must answer.
10. **Both capture paths must share `useCapture`** so they cannot drift apart.
11. **Diagnostics must never take down the capture path.** Every observability call swallows its own errors. A missing row costs a data point; a thrown error costs the user their transaction.
12. **Record which gate condition failed, not that one did.** A score cannot be acted on; a named condition can.
13. **Write `before_state` before destroying it.** Undo, edit and delete each erase the only copy of what the model proposed.
14. **Never trust byte count as evidence that audio contains sound.** Under a fixed-bitrate codec, silence and speech cost the same. Measure the signal, in the browser, where the PCM exists.
15. **Never let a suspended `AudioContext` speak for the microphone.** Zeros from a meter that isn't running say nothing about what was recorded.
16. **The portal fails closed.** An unset password denies everyone. It shows transcripts and amounts.

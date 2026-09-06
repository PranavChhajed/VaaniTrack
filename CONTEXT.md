# VaaniTrack — Complete Context

**This file is the single source of truth for understanding VaaniTrack.** It is written so that a person or an LLM can read only this and understand the product, the reasoning behind it, the architecture, the code, the current state, and what comes next — without opening another file.

Everything here reflects the codebase as of **6 September 2026**.

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

**Speech recognition is worst at exactly the field that matters most.** Raw ASR gets currency amounts right only 36.3% of the time — the lowest of every numeric category tested.

**This is why the app is a two-stage cascade** rather than plain speech-to-text: transcribe first, then have an LLM interpret the financial meaning. That path reaches 95.6% on amounts.

A useful side-finding: timestamps score **3.4%** at baseline — the worst number in the table. This independently justifies the decision to treat time as optional and never infer it.

Whisper was the best-performing model tested at **11.2% WER** on real-world use cases. Note that industry-wide, WER rises to **30–50% for accented speech** versus 2–8% for native speakers — directly relevant for Indian English.

---

## 6. How the app works (user's view)

### Capture screen (`/`)

1. Press the waveform button and speak: *"250 lunch"*
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
┌─────────────────────────────────────────────────────────┐
│  Browser (phone or laptop)                              │
│                                                          │
│  /            capture screen                             │
│  /journal     the record                                 │
│  /diag        diagnostics page                           │
│                                                          │
│  MediaRecorder ──▶ audio blob                            │
│  localStorage  ◀─▶ transactions                          │
└────────────────────────┬────────────────────────────────┘
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
└──────────────────────┘      └──────────────────────────┘
```

**Stage 1 (`/api/transcribe`)** turns audio into words and reports how sure it is.
**Stage 2 (`/api/extract`)** turns words into a transaction. **The prompt in stage 2 is the product** — it is where the 36.3% → 95.6% improvement actually happens.

### Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js **16.3.4** (App Router, Turbopack) |
| UI | React **19.2.8**, TypeScript |
| Styling | Tailwind CSS **v4** (CSS-first config in `globals.css`) |
| Transcription | Groq — `whisper-large-v3` |
| Extraction | Groq — `openai/gpt-oss-120b` (override via `GROQ_MODEL`) |
| Storage | Browser `localStorage`, key `vaanitrack.transactions` |
| Audio | Browser `MediaRecorder` API |
| Phone testing | Cloudflare quick tunnel (`cloudflared`) + QR code |

**Only one secret is needed:** `GROQ_API_KEY` in `.env.local`. It covers both models.

There is **no backend database, no auth, no server-side user state.** Every transaction lives in the browser that recorded it.

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

## 10. Trust mechanisms in the transcription stage

Stage 1 does more than call Whisper. It defends against the specific ways Whisper fails.

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

**Auto-saving is only acceptable because undo is trivial.** Every auto-logged entry announces itself with an Undo button.

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

## 14. File map

```
src/
  app/
    page.tsx              Capture screen. Today's transactions only.
    layout.tsx            Root layout, fonts, metadata
    globals.css           Tailwind v4 config, design tokens, animations
    journal/page.tsx      Journal — browse + day states, month sections
    diag/page.tsx         Diagnostics page
    api/
      transcribe/route.ts Stage 1 — audio → text + confidence
      extract/route.ts    Stage 2 — text → structured transaction

  components/
    WaveformButton.tsx    The record button with live level visualisation
    ReviewCard.tsx        "Check this before it's saved"
    TransactionList.tsx   Today's list on the capture screen
    TransactionRow.tsx    A single row in the journal, built for scanning
    TransactionDetail.tsx Full-screen inspect / edit / delete
    DatePicker.tsx        Month grid, marks populated days, blocks future
    DayCapture.tsx        The sheet that records onto a chosen day

  lib/
    types.ts              Transaction, Field, Provenance, localStorage
    useCapture.ts         THE capture pipeline — shared by both screens
    useRecorder.ts        MediaRecorder wrapper
    journal.ts            Grouping, time semantics, date helpers

scripts/
  journal.test.ts         34 assertions, no test framework
  dev-tunnel.mjs          Cloudflare tunnel + QR code
  dev-https.mjs           Self-signed HTTPS alternative

start-vaanitrack.bat      One-click morning startup (Windows)
```

### The most important files to read first

1. **`src/lib/types.ts`** — the provenance model everything else serves
2. **`src/app/api/extract/route.ts`** — the prompt, which is the actual product
3. **`src/lib/useCapture.ts`** — the pipeline and the confidence gate
4. **`src/lib/journal.ts`** — the time and grouping semantics

`useCapture.ts` exists so both the capture screen and the journal's day-sheet share **identical** capture behaviour, differing only in which date a capture lands on. Duplicating it would let the two paths drift.

---

## 15. Running it

```bash
npm install
```

Create `.env.local`:

```
GROQ_API_KEY=gsk_...        # free at console.groq.com
```

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev at `localhost:3000` (mic works — localhost is a secure origin) |
| `npm run build` / `npm start` | Production build |
| `npm run dev:tunnel` | **Phone testing** — production build + public HTTPS tunnel + QR code |
| `npm run dev:tunnel:hot` | Same, but hot reload instead of a build |
| `node --experimental-strip-types scripts/journal.test.ts` | Run the test suite |
| `start-vaanitrack.bat` | Windows one-click: clears stale processes, checks deps and API key, builds, tunnels |

### Why a tunnel is needed for phone testing

Browsers only grant microphone access on a **secure context**. A self-signed certificate is not enough — Chrome refuses `getUserMedia` even after you tap through the warning. A Cloudflare tunnel gives a genuinely trusted certificate, so the phone gets the microphone with no certificate to install.

---

## 16. Current state (6 September 2026)

**Working:**
- Voice capture with the two-stage cascade
- Typed capture as a first-class path
- Confidence gating, review cards, undo
- The journal: day grouping, month subtotals, time semantics, date picker
- Transaction detail with provenance display, editing, deletion
- Recording onto a chosen past day from the journal
- 34 passing data-layer assertions; TypeScript clean

**Repository:** `github.com/PranavChhajed/VaaniTrack` (private). One commit, `0a6c17e`. `.env.local` is gitignored and verified absent from the remote.

**Not yet done:**
- The formal Phase A acceptance pass (A1–A9) on a real phone
- Sustained real-world usage by the author

---

## 17. Known limitations and gotchas

**Data is `localStorage`-only.** Per-browser, per-device. Clearing browser data destroys it; phone and laptop keep entirely separate records; nothing syncs. Any serious version needs a real datastore. **This is the single biggest architectural limitation.**

**Cloudflare quick tunnels are a coin flip.** Each run gets a random hostname, and some ISP DNS resolvers (Airtel observed) return `NXDOMAIN` for them — the link then fails on every device on that network while appearing fine elsewhere. Two real bugs in `dev-tunnel.mjs`:
1. The `printed` flag latches on the first hostname, so if `cloudflared` reconnects with a new one, the script never tells you
2. Nothing verifies that *your* resolver can see the hostname before printing it

The durable fix is deploying to Vercel, which removes tunnels entirely.

**Verifying a URL from a different network path proves nothing.** A tool whose network egress differs from the user's machine will happily report HTTP 200 for a hostname the user's browser cannot resolve. Always verify from the same resolver the user's browser uses.

**No auth, no multi-user, no sync.** Single-user by design at this stage.

**English only in v1.** Hindi-English amount words (*"dhai sau"*, *"ek lakh"*) are handled in the extraction prompt, but the interface and general speech handling are English.

---

## 18. Roadmap

### Phase B — Spoken dates (next)

Teach the interpreter to understand temporal language:

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

The Phase A journal semantics are the contract Phase B must satisfy.

### Beyond

- **Deploy to Vercel** — permanent HTTPS URL, no tunnel, no laptop dependency
- **Real persistence** — replace `localStorage` so data survives and syncs
- **PWA** — manifest + service worker makes it installable (days of work)
- **Native wrapper** — Capacitor for app stores (weeks, not months) if warranted

---

## 19. Other documents

This file is meant to be sufficient. These hold the deeper detail:

| File | Contains |
|---|---|
| `PRD-VaaniTrack.md` | Full product requirements, FR-numbered, with claims tagged FACT / OBSERVATION / ASSUMPTION / DECISION |
| `RESEARCH.md` | ASR accuracy evidence, model comparisons, the numbers in §5 |
| `VAANITRACK_PHASE_A_JOURNAL_CONTEXT.md` | The journal specification — §33 holds the A1–A9 acceptance criteria |
| `DESIGN.md` | Full design token reference and component specs |
| `EXECUTION.md` | Build log |
| `IDEA.md`, `ITERATION-1.md`, `ITERATION-2.md` | Concept evolution |
| `transaction-journal-product-document.md` | Journal product thinking |
| `voice_transaction_100_test_cases.md` | 100 utterances for accuracy testing |
| `README.md` | Setup and run instructions |

---

## 20. If you change this code, preserve these

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

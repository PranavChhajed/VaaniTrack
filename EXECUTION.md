# VaaniTrack — Execution Log

**Living document.** Plan at the top, append-only log at the bottom. Updated as work happens.

**Deadline:** 2 days from 2026-09-05
**Split:** Day 1 = core loop working. Day 2 = everything else.

---

## Status

| | |
|---|---|
| **Now** | Day 2 started. Text fallback in. Phone capture confirmed working server-side. |
| **Blocked on** | Nothing. Awaiting a real voice test on the phone, then day 2 polish. |
| **Last updated** | 2026-09-05, day 1 |

Build passes, typecheck passes.
**Phone testing: `npm run dev:tunnel`** — prints a public URL with a trusted
certificate, which is the only way the phone microphone actually opens.
Run instructions in [`README.md`](README.md).

---

## Locked decisions

| Area | Decision |
|---|---|
| Platform | Next.js, web, responsive for phone browsers |
| Transcription | Groq `whisper-large-v3` |
| Extraction | Groq LLM, structured output with provenance |
| State | localStorage — demo grade, no DB, no auth |
| Design | `DESIGN.md` structure, oat palette, plus three additions (see below) |
| Scope | FR-1,2,3,4,5,9,10,12 in · FR-6,7,8,11 out |

Full reasoning in `PRD-VaaniTrack.md` v0.3 and `ITERATION-1.md`.

---

## Design direction

**`DESIGN.md`'s structure, kept.** A ledger-style redesign was tried and
rejected; see the log. The original is the design.

**Structure — unchanged from the reference:**
- 2px ink borders on interactive elements
- Zero shadows. Separation by fill and border, never elevation.
- Oversized radii: cards 32px, chambers 40–80px, pills 9999px, buttons 12px
- Paper canvas ↔ dark chamber alternation
- EB Garamond 400 at display scale, Figtree for all UI

**Palette — moved off the reference's yellow cream:**

| Token | Reference | VaaniTrack |
|---|---|---|
| Canvas | Lumen Cream `#ffffeb` | **Oat paper `#f0ede7`** |
| Card surface | *(same as canvas)* | **Raised paper `#f9f7f3`** |
| Primary action | Lavender `#f0d7ff` | **Mint `#cfead9`** |
| Secondary / live / ink | forest, ember, ink | unchanged |

**Three product-specific moves:**
1. **The waveform pill** — specified in the reference as a mic-active indicator
   — is promoted to the primary capture button.
2. **Ember Glow**, reserved in the reference for "active mic indicators", is
   the recording state.
3. **The hand-drawn underline**, editorial emphasis in the reference, marks
   inferred values (FR-10). Defaults sit in fog; unknowns get a dashed rule and
   no invented value.

**Additions on the restore:** `.money` sets amounts in Garamond with
`tabular-nums` so ledger columns align; day grouping with per-day subtotals;
`.rise` so review cards fade up on arrival.

---

## Plan

### Day 1 — the core loop

| # | Step | State |
|---|---|---|
| 1 | Scaffold Next.js + design tokens from `DESIGN.md` | in progress |
| 2 | `/api/transcribe` → Groq whisper-large-v3 | |
| 3 | `/api/extract` → Groq LLM, structured + provenance | |
| 4 | `MediaRecorder` capture, permissions, record→blob | |
| 5 | Wire end to end, text output on screen | |
| 6 | **Accuracy spike** — ~20 utterances, eyeball amount accuracy | |

**Day 1 done means:** speak into the browser, get a correct structured transaction. Styling can be rough.

### Day 2 — everything else

| # | Step | State |
|---|---|---|
| 7 | Review card (FR-12) — the screen that matters | |
| 8 | Edit-in-place + save to localStorage | |
| 9 | Transaction list | |
| 10 | Provenance treatment (FR-10) | |
| 11 | Multi-expense rendering (FR-5) if the LLM returns arrays | |
| 12 | Recording states, errors, empty state | |
| 13 | Phone layout + test on a real device | |

---

## Open questions during build

| # | Question | Status |
|---|---|---|
| 1 | Groq API key — needed for steps 2, 3, 6 | **asked** |
| 2 | Hold-to-record or tap-to-start/stop? | leaning hold, decide at step 4 |
| 3 | Does the Groq LLM return clean arrays for multi-expense without extra prompting? | find out at step 3 |

---

## Log

Newest at the bottom.

### 2026-09-05 — session start

- Read `DESIGN.md` in full. Wispr Flow system: editorial broadsheet, cream/dark chambers, 2px ink borders, shadowless, EB Garamond + Figtree.
- Decided the hue shift: lavender → mint for primary action. Everything structural kept.
- Identified three theme elements that map onto product needs: waveform pill → capture button, ember glow → recording state, hand-drawn underline → provenance marker.
- Skills installed: `frontend-design` (856K), `vercel-react-best-practices` (691K), `create-prd`, `find-skills`, `understand`.
- Scope confirmed from `ITERATION-1.md`: FR-6 conversational correction cut — review-before-save covers it for the demo.

### Day 1 — build

- **Scaffold.** Next.js 16.3.4 / React 19.2.8 / Tailwind v4 / TypeScript.
  `create-next-app` refused the folder name (npm forbids capitals in package
  names), so it was scaffolded to a lowercase temp dir and moved in.
  Package name is `vaanitrack`; the folder keeps its casing.
- **Design tokens** → `src/app/globals.css`. Full Wispr Flow scale, mint-shifted
  primary. EB Garamond + Figtree wired through `next/font`.
- **Data model** → `src/lib/types.ts`. Every field is `{value, provenance}`
  rather than a bare value — FR-10 forced this shape, and it turned out to be
  the thing that makes the review card honest.
- **`/api/transcribe`** → Groq `whisper-large-v3`. Includes a domain prompt
  priming the decoder with expense-shaped Indian English, since currency is
  ASR's weakest numeric category.
- **`/api/extract`** → Groq chat, `temperature: 0`, JSON mode. Ten explicit
  rules, each tracing to a PRD decision.
- **`useRecorder`** → MediaRecorder with codec negotiation (Safari gets mp4,
  Chrome webm/opus) plus a live AnalyserNode feeding the waveform bars, so the
  animation reflects real input instead of faking motion.
- **UI** → `WaveformButton`, `ReviewCard`, `TransactionList`, wired in `page.tsx`.
- Build passes, typecheck passes, dev server returns 200.

**Scope note — FR-6 partially came back for free.** *Intra-utterance*
self-correction ("250… no wait, 280") is one line in the extraction prompt and
costs nothing, so it is in. What stays cut is *cross-turn* correction
("actually, the coffee was 180" as a separate recording), which needs
conversation state and was the expensive half.

**Two deviations from `DESIGN.md`, both deliberate:**
1. The reference is a marketing site with a 120px hero. At 120px on a phone
   the headline breaks badly, so display type tops out at 48px rising to 64px
   on wider screens.
2. `Row` dividers use Lumen Stone rather than 2px ink. Ink borders are specified
   for *interactive* elements; using them on every list divider turned the card
   into a table and fought the editorial flatness.

### Day 1 — API key in, spike run

**Model discovery.** `llama-3.3-70b-versatile` no longer exists on Groq. The
account's actual chat models are `openai/gpt-oss-120b`, `openai/gpt-oss-20b`,
`groq/compound(-mini)`, `qwen/qwen3.6-27b`, `qwen/qwen3.8-27b`, `allam-2-7b`.
Switched the default to **`openai/gpt-oss-120b`** — largest available, and it
honours JSON mode. `whisper-large-v3` is available as assumed, so the
transcription route was already correct.

**Rate limits are a real constraint, not just a test annoyance.** The free tier
throttles on tokens-per-minute, and the first spike run 429'd after 5 calls.
Two responses:
- The system prompt was compressed to roughly half its length with every rule
  intact. Less throttling, lower latency, lower cost.
- Both routes now return a plain "hit the rate limit, wait a few seconds"
  message on 429 instead of a generic failure.

**Extraction spike: 12/12.**

| Utterance | Result |
|---|---|
| "250 lunch" | 250 / lunch / food — no questions |
| "120 chai" | 120 / chai / food |
| "300 lunch, paid in cash" | cash, provenance "said" — overrides the default |
| "300 lunch, 150 coffee and 80 snack" | 3 separate transactions |
| "uh, spent like 250, no wait, 280 on lunch" | one transaction, 280 |
| "Paid 500 to Rahul" | 500, payee Rahul, category empty, no confirmation |
| "250 to Pushpa" | flagged for confirmation |
| "I spent 400 on lunch yesterday" | date yesterday, time null |
| "fifteen hundred for groceries" | 1500 |
| "two fifty for auto" | 250 / transport |
| "1099 for headphones" | 1099 |
| "spent 99 on chai and 1250 on dinner" | 2 transactions, both amounts right |

**The most encouraging result is the blanks.** "coffee", "snack", "groceries"
and "headphones" all came back with *no category* rather than a guessed one.
That is rule 3 holding under pressure, and it is the behaviour FR-9 and FR-11
actually care about — the model declining to invent is worth more here than the
model being clever.

**Still untested: transcription.** The audio stage needs a real microphone and
cannot be exercised from the command line. That is the first thing to check in
the browser, and it is where R9 (36.3% baseline on currency) actually bites —
the numbers above are text-in, so they measure the interpret stage only.

### Day 1 — mic access off localhost

**Transcription confirmed working.** The server log shows `POST /api/transcribe
200` repeatedly from browser sessions, so the audio stage is live end to end.

**The reported failure in an external browser was a secure-context problem.**
Server logs contain zero 500s — every `GET /` returned 200 — so the error was
not coming from the app. Dev prints two URLs:

    Local:    http://localhost:3000
    Network:  http://192.168.1.12:3000

Browsers expose `getUserMedia` only in a secure context: HTTPS, or a localhost
origin. VS Code's built-in browser hits `localhost`, so the microphone works.
Any other browser pointed at the LAN IP over plain http gets
`navigator.mediaDevices === undefined`, and the original code reported that as
a vague "Could not start the microphone."

Two changes:
- `useRecorder` now detects an insecure context explicitly and says so, naming
  the host and the two ways out, instead of failing opaquely.
- Added `npm run dev:https` (`next dev --experimental-https --hostname 0.0.0.0`),
  which generates a locally-trusted certificate. **This is the script to use for
  phone testing** — the LAN IP over https will grant mic access.

### Day 1 — palette moved off the reference

The build still read as Wispr Flow because the canvas was Wispr's canvas.
`#ffffeb` is a distinctly *yellow* cream and it was doing most of the work of
making the page look like the reference.

| Token | Was | Now |
|---|---|---|
| Canvas | `#ffffeb` yellow cream | **`#f0ede7` oat paper** — warm, off the yellow axis |
| Card surface | (none — same as canvas) | **`#f9f7f3` raised paper** |
| Edge / dividers | `#e4e4d0` | `#ddd7cb` |
| Primary action | `#d4f0e0` | `#cfead9` — a touch deeper to hold against oat |
| Fog | `#8a8a80` | `#8a857c` — warmed to match |

Tokens renamed from `lumen-*` to `paper*` so the names describe what they are.
Forest Ink, Ember Glow and Vast Ink are untouched.

**The raised surface is the addition worth noting.** The reference is strictly
shadowless and puts cards on the same fill as the canvas, separated by border
alone. Introducing a second, lighter paper gives cards separation by *value* as
well as by border — depth without ever reaching for a shadow, which keeps the
system's rule while making the review card sit forward the way it should.

### Day 1 — redesign away from the reference

The palette change wasn't enough, and the reason is structural rather than
chromatic. `DESIGN.md` describes a **marketing site**: floating nav pill, 120px
serif hero, full-bleed alternating chambers at 40–80px radii, 2px ink borders
on everything. Those moves *are* the reference's identity. Ported onto an app
they read as someone else's landing page no matter what colour they're painted.

So the design language was rebuilt around an idea that belongs to this product:
**a ledger**. Ruled paper, a column of figures, money set apart from language.

| | Reference | Now |
|---|---|---|
| Type | Figtree + EB Garamond | **Manrope + Instrument Serif** |
| Serif used for | all display headings | **money, and nothing else** |
| Borders | 2px ink on everything | hairline rules; ink spent only on the capture button |
| Radii | 32px cards, 40–80px sections | 8–14px |
| Structure | nav pill, hero, alternating chambers | slim header, scrolling ledger, fixed capture bar |
| Dark | large rounded "chambers" | none — light throughout |

**The serif rule is the idea worth keeping.** Amounts are the only serif on the
page, set in tabular figures so digits stack down the ledger the way they do in
an account book. Language is sans, value is serif. It is a distinction that
means something in an expense tracker and nothing in a dictation app, which is
exactly why it reads as this product rather than that one.

**The fixed bottom capture bar** does most of the rest of the work. Primary
action at the thumb, ledger scrolling behind it — that silhouette is an app,
and it is the single change that most stops the page looking like a website.

Provenance moved from the hand-drawn SVG underline to a dotted rule. The
squiggle was charming but it was also a direct lift; a dotted underline reads
as annotation rather than decoration, which is closer to what it means.

### Day 1 — phone access

**The problem.** `getUserMedia` requires a secure context. A phone hitting
`http://192.168.1.12:3000` gets neither HTTPS nor localhost, so the microphone
is unavailable — the page loads and the product does not work.

**Next's `--experimental-https` alone is not enough.** It issues a certificate
for `localhost`, `127.0.0.1`, `::1` and `0.0.0.0` only. Verified against the
generated cert:

    X509v3 Subject Alternative Name:
        DNS:localhost, IP Address:127.0.0.1, IP Address:0:0:0:0:0:0:0:1, IP Address:0.0.0.0

No LAN address, so the phone gets a hard certificate error on every load.

**Fix:** `scripts/dev-https.mjs`, wired to `npm run dev:phone`. It resolves the
current LAN address at start time, reissues a mkcert certificate covering it,
starts Next with that cert, and prints the URL to open on the phone. The IP is
resolved per run because DHCP reassigns it — hard-coding it would break by
tomorrow.

**Tested over the LAN address, not just localhost:**

| Check | Result |
|---|---|
| `GET https://192.168.1.12:3000` | 200 |
| `GET https://localhost:3000` | 200 |
| `POST /api/extract` over LAN https | correct transaction, provenance intact |
| Certificate SANs | now includes `192.168.1.12` |
| Served CSS | new palette present, old palette absent |
| Served fonts | Instrument Serif + Manrope woff2 |

**Likely explanation for the earlier "asking me to confirm".** Windows Defender
Firewall prompts the first time Node binds to a network interface. Dismissing
it blocks the phone from reaching the laptop entirely. Documented in the README
with the rest of the phone setup.

### Day 1 — design reverted, ledger experiment dropped

The ledger redesign was rejected: the earlier design was the one worth keeping.
Restored in full — cards at 32px, the pill capture button with its 2px ink
border, the dark chamber ledger at 40/80px, EB Garamond display over Figtree UI,
the oat palette, the hand-drawn provenance underline.

The ledger language is recorded in the history above and is not being carried
forward. One idea from it survived on merit, as an addition rather than a
replacement:

- **`.money`** — amounts now render in Garamond with `tabular-nums`, so a
  column of figures stacks properly. ₹1,250 sits directly above ₹250 in the
  dark ledger instead of drifting. Same typeface, same look, just aligned.
- **Day grouping** in the ledger, with a per-day subtotal above each group.
  Entries were previously one flat list.
- **`.rise`** — review cards fade up on arrival, so a card appearing after a
  capture reads as a result rather than a layout shift.

Nothing about the shapes, borders, radii or palette changed.

### Day 1 — why the phone microphone stayed blocked

`dev:phone` was serving real HTTPS with a certificate covering the LAN IP, and
the page loaded on the phone — but the microphone still refused.

**Cause: Chrome does not treat an origin with a failed certificate validation
as a secure context, even after the user taps through the interstitial.** The
page renders, and every powerful feature stays blocked. `getUserMedia` is one
of them. A self-signed certificate therefore gets you the page on a phone and
never gets you the microphone, unless the signing CA is installed on the phone
itself.

**Fix: `npm run dev:tunnel`** (`scripts/dev-tunnel.mjs`). Runs the dev server
behind a Cloudflare quick tunnel, so the phone talks to Cloudflare over a
certificate it already trusts. No CA to install, no interstitial, no firewall
rule, and the phone does not need to be on the same network.

Verified through the tunnel URL, not just locally:

| Check | Result |
|---|---|
| `GET` via tunnel | 200 |
| TLS validation | `ssl_verify_result 0` — genuinely trusted, no bypass |
| `POST /api/extract` via tunnel | correct transaction, provenance intact |
| Served palette | oat `#f0ede7`, mint `#cfead9`, forest `#034f46`, ember `#ffa946` |
| Served fonts | EB Garamond + Figtree |
| Additions | `.money` with `tabular-nums`, `.rise` |

**Trade-off worth stating:** the tunnel URL is public while it runs. Random,
unlisted, and it dies with the process — but anyone holding it can reach the
app and spend the Groq quota. `dev:phone` remains available for staying off the
internet, at the cost of installing the root CA on the phone.

### Day 1 — phone capture fixed, and two real bugs found doing it

**Diagnosis came from the log, not a guess.** The phone had loaded the page four
times (`GET / 200`) and there was **no `POST /api/transcribe` at all**. So the
recording never produced an upload — and `handleStop` swallowed that:

    const blob = await stop();
    if (!blob) return;      // no message, ever

On a phone there is no console, so every failure looked identical to the app
being broken.

**Recorder fixes:**
- `recorder.start(200)` — a timeslice. Without one, Safari may deliver no data
  until teardown, and on some builds none at all. This is the most likely cause
  of the empty capture.
- `stop()` now returns a discriminated result, so an empty blob, a too-short
  tap, a recorder error and "nothing was recording" each surface a specific
  message instead of returning `null` into silence.
- AudioContext is resumed explicitly — iOS starts it suspended even inside a
  user gesture.
- `MediaRecorder` absence is reported (iOS below 14.3), rather than throwing.
- File extension now follows the actual mime type. *Not* the bug — Groq accepted
  a WAV mislabelled `.webm` in testing — but wrong is wrong.
- A visible diagnostic line on the page: bytes captured, mime type, duration,
  then what was heard. There is no devtools on a phone; the app has to say.

**Bug found: Whisper was hallucinating transactions from silence.**

The transcription prompt primed the decoder with example sentences, including
"I spent 700 on groceries, paid in cash." Given 1.2 seconds of a sine wave with
no speech at all, Whisper returned **exactly that sentence**, which the
extraction stage then turned into a ₹700 transaction.

For a product whose Principle 0 is *never record a wrong transaction*, silence
fabricating an expense is the worst failure available. Two fixes:
- The decoder prompt is now **vocabulary only, never sentences** — words that
  help recognition and cannot be read back as an expense.
- `verbose_json` gives per-segment `no_speech_prob` and `avg_logprob`. Audio the
  model itself doubts is rejected before it reaches extraction. The sine wave
  now returns "Didn't catch any speech there."

**Bug found: R9, live.** Real speech generated with Windows SAPI to test the
audio path end to end. Saying *"two fifty lunch"* transcribed as **`$2.50
lunch`** and recorded **₹2.5**.

This is precisely the failure `RESEARCH.md` §1.1 predicted — currency amounts
are the weakest numeric category in ASR at 36.3% baseline. Whisper heard the
digits correctly and formatted them as dollars.

Fixed at the extraction stage rather than by priming Whisper with numbers, which
would have reopened the hallucination risk. Everything in this product is
rupees, so a `$` in a transcript is by definition a transcription error:
`$2.50`→250, `$1.20`→120, `$15.00`→1500, while plain `$300`→300. Paise are not
used in practice, so a trailing `.50` is a misheard "fifty".

**End-to-end test with real audio — 5/5:**

| Spoken | Transcribed | Recorded |
|---|---|---|
| "two fifty lunch" | `$2.50 lunch` | ₹250 lunch [food] |
| "I spent three hundred on lunch and one fifty on coffee" | `I spent 300 on lunch and 150 on coffee.` | ₹300 lunch + ₹150 coffee |
| "paid five hundred to Rahul" | `Paid 500 to Rahul` | ₹500 → Rahul, no category |
| "fifteen hundred for groceries, paid in cash" | `1500 for groceries, paid in cash` | ₹1500 groceries, cash |
| *(sine wave, no speech)* | — | **rejected, nothing recorded** |

Verified through the public tunnel as well as locally, so this is the path the
phone actually takes.

### Day 2 — the phone was working; the screen wasn't

**Evidence first.** The log from the reported failure contains six complete,
successful round trips:

    POST /api/transcribe 200  ->  POST /api/extract 200     (x6)

So the microphone opened, audio uploaded, Whisper transcribed it, and the
extractor returned. The capture pipeline was never the problem on that attempt.

**Most likely cause: the review card renders below the fold.** On a phone the
hero — headline, paragraph, capture button — fills the viewport. The review
section sits under it. Tapping stop therefore produced a card the user could
not see, which is indistinguishable from the app doing nothing.

Three changes so this is never ambiguous again:

- **The review section scrolls into view** the moment a card exists.
- **Server-side logging** of the transcript and the extraction result:

      [transcribe] 83582B audio/wav -> "$2.50 lunch" (noSpeech 0.15)
      [extract] "$2.50 lunch" -> 1 txn(s): 250 lunch

  An empty extraction is logged explicitly as `<-- EMPTY, user sees an error`,
  since that is the one 200 response that still means failure.
- The on-screen diagnostic line already reports bytes, mime type, duration and
  what was heard.

The next attempt produces evidence rather than another hypothesis.

### Day 2 — text fallback

Added a text input beside the microphone, running the same extraction and
review path. `/api/extract` already took text, so this reuses everything that
carries the actual product thinking and skips only transcription.

Two reasons it was prioritised above polish:

1. **A microphone failure was a total demo failure.** Noise, a denied
   permission, an unfamiliar browser — any of them and there was nothing to
   show. Now there is.
2. **It is faithful to the original insight.** The source document's example of
   existing behaviour was *typing* `250 lunch` into WhatsApp. Text is the
   behaviour the product was modelled on, not a lesser path bolted on.

Verified through the tunnel: `"250 lunch"` → ₹250 lunch [food] · UPI.

Plan for the rest of day 2 in [`ITERATION-2.md`](ITERATION-2.md).

### Day 2 — correction: the phone was never confirmed working

Earlier I read six `POST /api/transcribe 200` entries as proof the phone's
capture path worked. That was wrong. `e2e.mjs` was run twice plus tunnel checks
— **nine or more of those calls were my own tests**. There is still no evidence
any capture from the phone has succeeded.

**Two hang risks found on re-reading `useRecorder`:**

1. `await ctx.resume()` on the AudioContext. By that point the user gesture has
   been spent on `getUserMedia`, and on iOS the resume promise can hang
   indefinitely — leaving `start()` pending, the state stuck on "requesting",
   and the button inert with no error. The level meter is cosmetic; recording
   must never wait on it. Now fire-and-forget.
2. `stop()` awaited `onstop`, which does not fire on some mobile builds. Added
   a 3-second watchdog that resolves with whatever chunks exist, or reports
   "the recorder never returned any audio" — rather than leaving the caller
   awaiting forever behind a "Working…" button.

Also removed the `requestData()` call before `stop()`; `stop()` flushes a final
chunk on its own and the extra call can produce an empty chunk on some
implementations.

**Added `/diag`** — a diagnostics page that walks the capture path one step at
a time and prints each result on screen: secure context, `mediaDevices`,
`MediaRecorder`, which mime types the device supports, the user agent, then
three buttons for permission → record 3s → upload. Every chunk size is logged
as it arrives. Guessing from server logs has now cost two wrong conclusions;
this makes the device answer for itself.

### Day 2 — FR-12 reversed: confidence-gated save

Product owner reversed the blocking-review decision. Confident captures now log
immediately; only uncertain ones ask.

The gate requires **both**:
- the extractor did not flag the utterance ambiguous, and
- the amount's provenance is `said` — explicitly heard, not inferred or defaulted.

Verified:

| Utterance | Gate |
|---|---|
| "250 lunch" | amount=250, prov=said, needsConf=false → **auto-log** |
| "paid 500 to Rahul" | amount=500, prov=said, needsConf=false → **auto-log** |
| "250 to Pushpa" | needsConf=true → **ask** |
| amount not heard | prov≠said → **ask** |

Auto-logging is not silent: a strip names what was recorded and offers **Undo**.
Saving without asking is only defensible if reversing it is trivial.

This is the gate the extractor was always built for — `needsConfirmation` and
per-field provenance existed from day one, and blocking review ignored both.
PRD §7.2 FR-12 updated; the superseded decision is kept in place for the record.

### Day 2 — eliminating layers instead of guessing

The phone loaded `/diag` four times (`GET /diag 200`) and produced **no POST of
any kind**. A page that renders but whose buttons do nothing points at the
page's JavaScript never running — which would also leave the environment table
empty. That is a hydration or bundle-parse failure, not a microphone problem.

Two layers removed rather than debated:

**1. `public/check.html` — a diagnostic with no app code in it.**
No React, no bundler, no modules, no hydration. Deliberately written in ES5:
no arrow functions, no optional chaining, no template literals. It reports
secure context, `mediaDevices`, `MediaRecorder`, supported mime types and the
user agent, then walks permission → record → upload with every chunk size
printed. A "copy output" button, since reading a phone screen back is
error-prone.

This splits the question cleanly:
- `check.html` works, `/diag` does not → the app bundle is the problem.
- Neither works → the browser or the origin is the problem.
- Both work → capture is fine and the fault is elsewhere in the app.

**2. Serving a production build behind the tunnel.**
`next dev` ships an HMR WebSocket and unbundled chunks. Over a Cloudflare
tunnel, on a phone, that is a fragile combination, and a hydration failure
there looks exactly like "the buttons do nothing". `npm run dev:tunnel` now
builds first and runs `next start`, so the phone gets static pre-built chunks.
`dev:tunnel:hot` keeps the old behaviour for desktop work.

**Note:** the tunnel URL changes on every restart. The old link is dead; the QR
in `phone-link.png` is regenerated each run and now points straight at
`/check.html`.

### Day 2 — the device answered: capture was never the problem

Diagnostics from a real device (Android 10, Chrome 152 Mobile):

    Secure context ✓   mediaDevices ✓   getUserMedia ✓   MediaRecorder ✓
    Audio formats  ✓   audio/webm;codecs=opus, audio/webm, audio/mp4...
    permission     ✓   granted, track live
    recording      ✓   20,101 bytes over 3014ms, audio/webm;codecs=opus
    upload         ✓   200
    transcript     ✗   "Hello, how are you?"

**Every layer worked.** The whole capture path — permission, recorder, codec,
chunking, upload — was correct the entire time. Two rounds were spent hunting a
bug that did not exist, on a path the logs could not distinguish from my own
test traffic.

**The actual failure is a Whisper hallucination.** Given unclear or clipped
audio the model does not return empty; it returns a confident stock phrase.
"Hello, how are you?" is one of its best known, and it arrived with
`no_speech_prob` of 0, so the existing confidence guard had no reason to stop it.

**Reading the chunk sizes tells the rest of the story:**

    204, 71, 72, 72, 72, 72     <- ~1.2s of near-silence (reaction time)
    392, 3880, 3880, 3880,
    3880, 2617, 1009            <- ~1.4s of loud speech, then the window closed

3880 bytes is a saturated 200ms Opus frame, so the audio was loud, not quiet —
overall ~6,700 bytes/sec, healthy. But a fixed 3-second window minus 1.2s of
reaction leaves under two seconds, and "two fifty lunch" barely fits. A clipped
utterance is exactly what makes Whisper reach for a stock phrase.

**Three fixes:**

1. **Stock-phrase denylist.** Exact match after normalising, never substring, so
   "250 for a thank you gift" is untouched. Verified against real SAPI audio of
   the phrase itself: rejected as `stock-phrase`, while "two fifty lunch" still
   passes.
2. **No-amount guard.** A transcript with no digit and no number word cannot be
   an expense. Rejected with the transcript quoted back, so the user sees what
   was misheard instead of a generic failure.
3. **`check.html` now records 5 seconds with a visible countdown, reports
   bytes/sec, and plays the recording back.** Playback is the decisive test
   left: if it sounds clear and Whisper still mishears, the fault is the model;
   if it sounds clipped or empty, the fault is the window.

**Also serving a production build behind the tunnel now** — `next dev` over a
tunnel on a phone risks a hydration failure that looks exactly like dead
buttons. `npm run dev:tunnel` builds first and runs `next start`.

### Day 2 — my own decoder prompt was the bug

The second device report gave clean audio and a garbled transcript:

    47,976 bytes over 5017ms · ~9,563 bytes/sec · "loudness looks fine"
    heard: "Hello, hi, so I want 50 rupees for lunch now."

Loud, clearly speech, and still wrong. That made the decoder prompt testable
rather than a matter of opinion. Same recording of "two fifty lunch", three
prompts:

| Decoder prompt | Transcript |
|---|---|
| *(none)* | ` 2.50 lunch.` |
| vocabulary words — what I had shipped | ` $2.50 lunch` |
| `Amounts in Indian rupees: 250, 120, 1500, 300.` | **` 250 lunch.`** |

**The prompt I added to help was actively making it worse.** Priming with bare
vocabulary pushed Whisper toward dollar formatting; showing it what an Indian
amount actually looks like fixed the amount at the source.

Those digits were the exact hallucination risk that made me strip examples in
the first place, so it was re-tested rather than assumed: on silence this prompt
yields "Subtitles by the Amara.org community" — not a fabricated amount — and
that phrase was already on the denylist. Safe.

This also retires the `$2.50 -> 250` repair rule's day job. The rule stays as a
belt-and-braces measure, but the amount now arrives correct.

**Transcription confidence now gates auto-logging.** Whisper's mean
`avg_logprob` is returned to the client; a shaky transcript earns a review card
instead of being logged silently. Calibrated rather than guessed: a
known-correct transcript ("250 lunch.") scores **-0.64**, so an initial -0.55
threshold would have sent good captures to review. Set to -0.9 and surfaced in
the on-screen debug line so it can be tuned against real captures.

**Verified through the live tunnel on the production build:**

| Spoken | Transcript | Recorded |
|---|---|---|
| "two fifty lunch" | `250 lunch.` | ₹250 |
| "three hundred on lunch and one fifty on coffee" | `I spent 300 on lunch and 150 on coffee.` | ₹300 + ₹150 |
| "paid five hundred to Rahul" | `Paid 500 to Rahul.` | ₹500 → Rahul |
| "fifteen hundred for groceries, paid in cash" | `1500 for groceries, paid in cash.` | ₹1500, cash |
| *(sine wave)* | `Subtitles by the Amara.org community` | rejected |

**Operational note:** cloudflared quick-tunnel DNS does not always propagate.
One URL never resolved at all. Restarting yields a new hostname, so the startup
check now polls the URL until it actually returns 200 before it is handed over.

---

## Session: denylist correctness + tunnel readiness

**Bug found while re-verifying, not while looking for it.** The sine-wave probe
came back rejected — but for the wrong reason. Server log:

```
[transcribe] REJECTED 38444B -> "Subtitles by the Amara.org community"
             (stock=false noNumber=true noSpeech=0.44)
```

`stock=false` on a phrase that is *literally an entry in the denylist*.

**Cause.** `HALLUCINATIONS.has(normalise(text))` normalised the incoming text
but not the entries. `normalise()` strips `.,!?;:"'`, so:

| entry as written | after normalise | could ever match? |
|---|---|---|
| `hello how are you` | `hello how are you` | yes |
| `hello how are you?` | `hello how are you` | no — dead |
| `thank you.` | `thank you` | no — dead |
| `bye.` | `bye` | no — dead |
| `subtitles by the amara.org community` | `subtitles by the amaraorg community` | no — dead |

Four of sixteen entries were unreachable. The Amara phrase was still rejected,
but only by the `noNumber` backstop — which would **not** have caught a stock
phrase containing a digit. That is a Principle 0 hole: a fabricated amount
reaching the ledger.

**Fix.** `.map(normalise)` on the Set initialiser, so both sides go through the
same function. `normalise` is a hoisted function declaration, so it is callable
from the initialiser above it — verified rather than assumed.

Confirmed live: `reason` moved `no-amount` -> `stock-phrase`.

**Tunnel readiness probe.** `dev-tunnel.mjs` printed the URL the moment
cloudflared mentioned it, before Cloudflare edge DNS had published it — which
is how a dead link was handed over last session. Now polls until the tunnel
answers before printing. It caught a real failure on its first run. Budget
raised 60s -> 3min after a tunnel that came up at ~90s.

**Verified through the live tunnel:** e2e 5/5.

| spoken | heard | recorded |
|---|---|---|
| two fifty lunch | `250 lunch.` | ₹250 lunch [food] UPI |
| three hundred lunch, one fifty coffee | `I spent 300 on lunch and 150 on coffee.` | ₹300 + ₹150 |
| paid five hundred to Rahul | `Paid 500 to Rahul.` | ₹500 -> Rahul |
| fifteen hundred groceries, cash | `1500 for groceries, paid in cash.` | ₹1500 cash |
| (sine wave) | `Subtitles by the Amara.org…` | rejected `stock-phrase` |

**Blocked on:** device confirmation. No ITERATION-2 task starts until voice
capture is confirmed working on the user's phone.

---

## Real-device accuracy data (first genuine corpus)

Voice capture confirmed working end-to-end on the user's phone. Both codec
paths exercised: `audio/webm;codecs=opus` and `audio/mp4` (iOS Safari).

### The finding: utterance length dominates accuracy

Sorted by Whisper confidence, the pattern is not about volume or codec — it is
about how much the user said.

| conf | transcript | verdict |
|---|---|---|
| -0.21 | "Okay, so I had a monster like three cans of monster monster for a total of 350 rupees." | ₹350, description intact |
| -0.22 | "500 lunch, 600 dinner, 700 outing." | 3 txns, all correct |
| -0.35 | "900 groceries." | correct |
| -0.43 | "7.50 at dinner." | ₹750 — decimal rule recovered it |
| -0.51 | "50 rupees lunch." | correct |
| -0.59 | "30 rupees for lunch." | correct |
| -0.51 | "Two rupees your phones." | amount ok, description garbage |
| -0.52 | "5 rupees for Chowki Chowki." | amount ok, description garbage |
| -0.68 | "50 Rahul." | amount ok, payee dropped |
| -0.77 | "500 for Kronov." | amount ok, payee garbled |
| -0.76 | "20 lunch, 50 ball." | "ball" is wrong |
|  —    | "Thank you, Rahul." | rejected, no amount |
|  —    | "PAYO REPEATS FOR CHOKI CHOKI." | rejected, no amount |
|  —    | "So, stay the peace lunch." | rejected, no amount |

**Long natural sentences transcribe near-perfectly (-0.21, -0.22). Terse
two-word utterances degrade badly (-0.68 to -0.77).** Whisper is a language
model as much as an acoustic one: "50 Rahul" gives it no context to constrain
the decode, while a full sentence does. Every garbled result in this corpus is
a short utterance; every clean one is either long or a well-formed short phrase
with a unit word ("rupees", "at").

### What this invalidates

The confidence gate alone cannot separate good from bad here: -0.51 appears on
both a correct capture ("50 rupees lunch") and a garbled one ("Two rupees your
phones"). Threshold tuning will not fix this class. The amount is nearly always
right; the *description* is what degrades.

That matches the user's own bar exactly — 95% on amounts looks reachable, 80%
overall is being dragged down by descriptions, not amounts.

### Consequences to act on

1. Guide the user toward full sentences — this is a product-surface fix worth
   more than any threshold change.
2. Gate on description plausibility, not just acoustic confidence. A description
   the extractor could not tie to a known category or a spoken noun should be
   dropped to null rather than logged as noise.
3. `.captures/` now saves every capture with its outcome, so these can be
   replayed offline instead of re-tested on a device.

**Infra:** tunnel now runs independently of `next start`, so a rebuild no
longer changes the URL.

---

## Iteration 3 planned — the Transaction Journal

Source: `transaction-journal-product-document.md`. Plan: `ITERATION-3.md`.

The document makes the journal the **main screen** rather than a list beneath the
mic. That is an IA change, so it gets its own iteration instead of a task inside
Iteration 2.

Two collisions surfaced while planning, both recorded in the plan rather than
resolved silently:

1. **Time on a row.** The journal mockups print a clock time on every row; the PRD
   forbids inferring or fabricating `time` (§7.4), and in practice `time` is
   `unknown` on every capture so far. `created_at` is the way through, but it
   cannot be printed as a spend time — for a backdated entry ("dinner yesterday",
   logged today) that would state something false under a Yesterday heading.
   Resolved as three cases keyed on what is actually known, with backdated rows
   showing no time at all.

2. **Date picker behaviour.** §9B implies a continuous scroll; §11 implies a
   single-day view. Resolved toward one continuous journal, with an empty date
   shown in place rather than switching into a filtered mode.

Also flagged: **relative dates have never been tested.** Acceptance Scenario 3
("400 on dinner yesterday" landing under Yesterday) depends on extraction
resolving relative dates, and every capture in the corpus so far is same-day.
Scheduled early as Iteration 3 Task 2 — it is cheap, independent of the UI, and
half the iteration cannot be evaluated until it works.

---

## Transaction Journal — decisions taken (2026-09-06)

Product doc: `TRANSACTION-JOURNAL.md` v0.2. `ITERATION-3.md` marked ON HOLD — its
premise (journal becomes the main screen) was withdrawn by the product owner:
the voice screen stays untouched, the journal is added beside it.

The real feature is **backdating by voice** — "I paid 400 for dinner on
2 September" landing under 2 September. The list is evidence that worked.

| # | Decision | Resolution |
|---|---|---|
| D1 | Spoken date auto-logs up to | 14 days back |
| D2 | Future date | Rejected with an explanation |
| D3 | Capture inherits the viewed day | Yes, silently |
| D4 | Voice navigation | No |
| D5 | Placement | Its own screen, /journal |
| D6 | Editing in this phase | Yes |
| D7 | Two-week rule on an inherited date | No — spoken dates only |

**D7 resolves a contradiction the other answers created.** D1 stops a date more
than 14 days back; D3 silently accepts the viewed date. Viewing 2 July and
speaking "250 lunch" satisfied both and they disagreed.

Resolved by asking what each rule defends against. The 14-day bound exists
because **speech can be misheard** — Whisper confuses month names the same way it
confused amounts. A date reached by tapping cannot be misheard. Applying a
mishearing defence to a date nobody spoke is friction protecting against nothing.

**Date is now a Principle 0 field.** Until now "never record a wrong transaction"
was mostly about the amount, because a wrong amount is seen immediately. A wrong
date files a real expense under a day nobody revisits. Same care, same testing.

**Still unexercised:** date resolution has never run. Every capture in the corpus
is same-day. Scenarios 1, 4, 5, 6 and 7 all fail today.

### Revised same day — D3 reversed, work split into two phases

`TRANSACTION-JOURNAL.md` v0.3.

**D3 withdrawn.** Capture never inherits the day being viewed. Every date in the
journal is now either spoken aloud or typed by hand — none is guessed from screen
state. This removes the only place in the design where a wrong date could be
written without anyone seeing it, and it deletes D7, which existed only to
referee the conflict D3 created.

Precedence is now two rules, not three: a spoken date wins, otherwise today.

**D8 — phasing.** Journal first, spoken dates afterwards.

| Phase | Contents |
|---|---|
| A | Journal screen, day sections, totals, ordering, date navigation, detail screen, edit, delete. No voice changes. |
| B | Extraction resolving "on 2 September", "last Tuesday", "the 2nd"; the 14-day rule; refusing ranges and future dates. |

The phases do not touch each other: the journal reads `Transaction.date`,
extraction writes it, and that field already exists and is already populated.

**The gap, and the fix.** Until Phase B every capture lands on today, so the
journal would hold one day section and none of its real behaviour could be
exercised — day grouping, ordering, jump-to-date, Today, empty states all need
multi-day data. **Editing is the way through:** log transactions, then move them
across days by hand. That makes the edit screen the test harness for the rest of
Phase A, so it moves early in the order rather than late.

---

## Phase A built — the journal (2026-09-06)

Spec: `VAANITRACK_PHASE_A_JOURNAL_CONTEXT.md`. Superseded docs deleted
(`TRANSACTION-JOURNAL.md`, `ITERATION-3.md`, `IDEATION-PROMPT.md`).

### Decisions taken to unblock implementation

| Block | Resolution |
|---|---|
| Journal architecture (§8 vs §18) | Two states of one screen: browse = all populated days newest first (default); day = one chosen date, entered from the picker. Day-by-day scrolling deliberately not built. |
| Logged stamp on a moved row (§5 conflict) | The logged stamp carries a date whenever the transaction date differs from the day it was logged: "logged 6 Sep, 9:40 PM". Same-day stays "logged 9:40 PM". |
| Unknown-time ordering (§13) | Two zones per day. Timed rows form a chronology; untimed rows sit beneath under "Time not recorded", ordered by created_at. Nothing untimed is ever placed between two known times. |
| Future dates in editing (§29) | Rejected, with the date input capped at today. |
| Empty-day CTA (§20) | Plain "Record an expense" opening normal capture. Never "Record for 2 September" — that needs the interaction design §37.2 defers. |

### Built

- `src/lib/journal.ts` — grouping, day totals, ordering, clock parsing, time
  semantics, month grid, date helpers. 23 unit checks in
  `scripts/journal.test.ts`, all passing.
- `src/app/journal/page.tsx` — the screen, both states, empty states, sparse-day
  capture prominence (threshold as a named constant, not scattered).
- `src/components/TransactionRow.tsx` — scan-optimised row; falls back to payee
  as the primary label when no description exists (§17).
- `src/components/DatePicker.tsx` — navigation only; marks populated days,
  disables future dates.
- `src/components/TransactionDetail.tsx` — full record with provenance, edit all
  seven fields, delete behind one confirmation.

### The only change to existing UI

The main screen header badge, which said "Voice capture" — a label describing the
screen you were already on — became a "Journal" link. Nothing else moved.

### Provenance on edit

A field the user types becomes provenance `said` (FR-10 state 1, "explicitly
provided by the user"). Untouched fields keep what they arrived with, so the
detail view stays truthful about which values the app supplied itself.

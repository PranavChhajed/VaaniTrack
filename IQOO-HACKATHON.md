# VaaniTrack at the iQOO Hackathon — Chennai City Battle

Team **Devise** (`6XWSD7`) · Yash (leader) · Mouriyan Gandhi · Pranav Chhajed
Track: **FinTech and Commerce** · Chennai, Sat 12 – Sun 13 Sept 2026

---

## 1. The clock

| What | When | Who |
|---|---|---|
| Phase 1 idea submission | **8 Sept** (~2 days) | Yash only — leader-submits |
| On-site battle | 12–13 Sept (6 days) | All three, in person |
| Grand Finale | 9–11 Oct, Bengaluru | Top 6 per city |

Two of four cities are gone (Bengaluru 29–30 Aug, Pune 5–6 Sept). Chennai is the run.

**The only mandatory attachment is the deck.** Title, description and deck are the
blocking items; video and prototype URLs are optional but we have both.

---

## 2. The originality question — settled

The rules say *"code written during the event window… carrying in a completed app is
not [allowed]"*, and the submission form says *"any pre-existing components are
disclosed."*

Those reconcile one way: **the idea and the prior work go in declared; the code that
gets judged is written in Chennai.** That is not a compromise here, because the
hackathon build is a different application from the one that exists — a native,
on-device Android app versus a cloud web app. Almost nothing ports as code.

What we carry in legitimately, and say so:

- The product thinking, validated against real captures
- The trust model (provenance + confidence gate) as a **specification**
- The design system
- A working web prototype as **evidence the idea is real**, linked openly

Disclosure wording is in §9. If there is any doubt, one mail to
sameera@reskilll.com before the 8th removes it.

---

## 3. What VaaniTrack becomes

**Today:** voice expense capture. Cloud ASR (Groq Whisper) + cloud LLM extraction.
Next.js PWA on Vercel. Needs a network for every single capture.

**For iQOO:** the same product with the intelligence moved onto the phone.

> **Speak an expense. Offline. In Hinglish. Nothing leaves the device.**

This is not rule-chasing. It is a better product for the actual user:

| Cloud today | On-device |
|---|---|
| Every capture needs data | Works in a market, an auto, a basement |
| Financial data leaves the phone | Nothing leaves the phone |
| Cost per transcription | Zero marginal cost — viable for users who can't be monetised |
| 2–4s round trip | Local latency |

Expense capture happens exactly where connectivity is worst. That is the pitch.

---

## 4. The thing judges will remember

Novelty is 20% of the rubric. Our novelty is not "voice expense tracker" — that
exists. It is the **trust layer**:

- **Per-field provenance** — every field is marked `said` / `inferred` / `default` /
  `unknown`. The app can always say which parts you actually spoke and which it
  supplied.
- **A four-condition confidence gate**, not a score: the audio was heard well, the
  extractor did not flag ambiguity, an amount exists, and the amount was *said* not
  inferred. All four, or it goes to review instead of saving.
- **Principle 0 — never record a wrong transaction.** A wrong amount is spotted
  immediately; a wrong date files a real expense under a day nobody revisits.

Every other AI demo on that floor will hallucinate confidently. Ours refuses to.
That contrast is the memorable 30 seconds of the pitch.

---

## 5. Feature slate — ranked by points per hour

### MUST — without these there is no entry

1. **On-device ASR.** Whisper via Qualcomm AI Hub's NPU-optimised build, or
   `whisper.cpp` / `sherpa-onnx` as fallback.
2. **On-device extraction.** Small instruct model (Gemma 3 1B, Qwen2.5-1.5B, Llama
   3.2 1B) via MediaPipe LLM Inference or ONNX Runtime GenAI.
3. **Trust layer** — provenance, gate, review card, undo. Port the spec, not the code.
4. **Journal** — day grouping, month totals, edit, delete.
5. **Offline proof** — the whole flow in airplane mode.

### SHOULD — these buy rubric points directly

6. **Camera → receipt / UPI screenshot → on-device OCR → transaction.** Creative
   phone use is 15% and explicitly names *camera*. Also the best visual demo beat.
7. **Hindi / Hinglish** — "dhai sau", "ek lakh", "sau rupaye". India impact, and
   the FinTech track says *"built for how India actually transacts."*
8. **On-device monthly insights** — category breakdown, trend, all local.

### COULD — only if ahead of schedule

9. UPI **SMS auto-capture**, parsed on-device
10. Budget alerts
11. Voice query — "how much did I spend on food this month"

**Cut ruthlessly.** A working simple product beats a broken complex one — the rubric
says so in as many words.

---

## 6. Stack — the one decision to make before the 8th

Every entry must run and pitch on the phone. The NPU is the explicit target.

| Option | Upside | Downside |
|---|---|---|
| **A. Native Android** (Kotlin + Compose) | Real NPU access. Best scores on Technical Depth (15%) and Creative Phone Use (15%). Unambiguous for HackTracker telemetry. | Full build. Needs real Android skill on the team. |
| **B. Capacitor wrap** of the existing React app | Fastest to something demoable | This *is* carrying in the app. Fails the originality rule. |
| **C. PWA + WebGPU** (`transformers.js`) | Reuses web skills | Does not use the NPU. Browser support on OriginOS 6 unverified. Weakest on the two hardware-scored lines. |

**Recommendation: A.** We are rebuilding regardless, so build the version that scores.

**The gating question — answer it today:** *does anyone on this team ship Android?*
The form asks for Android and LLM proficiency, which means shortlisting weighs it.
If the honest answer is no, drop to **C** and win on product quality and novelty
instead of hardware depth. Choosing A with no Android experience is how a team
spends 30 hours fighting Gradle.

**Practical notes**

- The phone is a **loaner, handed over at Saturday check-in**. Nothing can be
  pre-installed. Assume first-run model download or sideload time and budget for it.
- Model weights are large. Have them on a laptop and on a USB drive before travelling.
- The mentor and jury lists published so far are **Bengaluru's**; Chennai's panel is
  not announced. If Qualcomm DevRel is on the floor, that is the first person to find
  — NPU deployment is where hours vanish.
- Office Kit is 10%, read from device telemetry. It is a *process* score, not a
  product one. Use it genuinely and often; it is free marks.

---

## 7. The 30 hours

Clock starts Sat 10:00, hacking 11:00, awards Sun ~16:15. 55% of build time is Red
Light (phone only, via Office Kit).

| Window | Goal |
|---|---|
| Sat 11:00–15:00 | **Skeleton + ASR on device.** Record → transcript on screen. Nothing else matters until this works. |
| Sat 15:30 | Mentor round — bring the NPU deployment problem, whatever it is |
| Sat 15:00–19:00 | **Extraction + trust layer.** Transcript → fields with provenance → gate → review card |
| Sat 19:00–22:00 | **Eval Round 1** — scored. Have the end-to-end voice path working, even if ugly |
| Sat 22:00–02:00 | **Journal + persistence.** Room/SQLite. Day grouping, totals, edit, delete |
| Sun 02:00–06:00 | **Camera + OCR path.** Hinglish tuning |
| Sun 06:00–09:00 | Polish, seed realistic data, freeze features |
| Sun 09:00 | **Eval Round 2** — demo on the phone at the table |
| Sun 09:00–13:30 | Rehearse the pitch. No new code. |
| Sun 13:45 | **Top 10 pitches** — 3–5 minutes live |

**Rule for the night:** feature freeze at 06:00. Everything after is rehearsal and
bug fixes. Teams lose here by shipping a broken new feature at 08:00.

---

## 8. Earning each rubric line

| Line | Weight | How we earn it |
|---|---|---|
| End product quality | 30% | It works offline, end to end, and the journal makes it something you'd keep using |
| Novelty and impact | 20% | The trust layer. Provenance + refusal-to-guess. Financial inclusion angle is real |
| Creative phone use | 15% | Voice **and** camera **and** on-device AI — all three named categories |
| Technical depth | 15% | NPU inference, two-stage cascade, offline-first, on-device DB |
| Office Kit usage | 10% | Use it constantly and honestly — it is telemetry, not a claim |
| Demo and presentation | 10% | §10 |

---

## 9. Phase 1 submission — paste-ready

**Idea title**

```
VaaniTrack — speak your expenses, offline
```

**Description** (50 char minimum; this is ~180 words)

```
VaaniTrack turns a spoken sentence into a verified expense record, entirely on
the phone.

The problem: India's next 400 million users do not track spending. Manual entry
is too slow at the moment money leaves your hand — in a market, an auto, a shop
queue. Existing apps need typing, a network, and trust that your financial life
is safe on someone's server.

VaaniTrack listens. "Two fifty for lunch, five hundred for a book" becomes two
transactions with amount, description, category, payee and date. It runs
Whisper and a small instruct model on the Snapdragon NPU, so it works with no
network at all and no financial data ever leaves the device.

The core is a trust layer we have not seen elsewhere. Every field carries
provenance — said, inferred, defaulted, or unknown — and a four-condition
confidence gate decides whether to save silently or ask. The governing rule is
that a wrong transaction is worse than no transaction, so when the app is not
sure, it says so instead of guessing.

Camera capture reads receipts and UPI screenshots through the same pipeline.
Hindi-English amounts ("dhai sau", "ek lakh") are handled natively.
```

**Prototype URL** — `https://vaanitrack.vercel.app`
The repo is currently private. **Make it public before submitting**, or the link
proves nothing to a screener.

**Deck** — required. See §11.

**Prior builds & hackathons** — each member fills their own honestly.

**What makes you and your team stand out** — draft:

```
We have already built and shipped a working version of this idea and tested it
on real devices, so we are not starting from a hypothesis. That build surfaced
the failures that actually matter in voice capture — silent recordings that look
healthy to every metric, transcription models that hallucinate confident stock
phrases on quiet audio, microphones that emit digital silence for over a second
after the browser hands over the stream. We found each of those by instrumenting
the pipeline and measuring, not by guessing.

That is why our proposal is a trust layer rather than a demo. We know what this
category gets wrong, because we have already been wrong in each of those ways
and fixed it.

Chennai is where we move that intelligence onto the phone.
```

**Originality checkbox** — tick it, and disclose in the description or a note:

```
Pre-existing component disclosed: a web prototype of this idea
(github.com/PranavChhajed/VaaniTrack, live at vaanitrack.vercel.app) built
before the event using cloud APIs. The Chennai build is a new native Android
application with on-device inference; the prior work contributes the product
specification and design, not code.
```

---

## 10. The pitch — 3 to 5 minutes

1. **Open on the problem, not the app.** "Nobody tracks expenses because entry is
   slower than spending." 20s.
2. **Put the phone in airplane mode on stage.** Show the toggle. Speak an expense in
   Hinglish. It lands. — this is the moment that wins the room. 60s.
3. **Show the trust layer.** Speak something deliberately unclear. The app declines to
   guess and asks. Then show provenance on a saved row. 60s.
4. **Camera.** Point at a receipt. Same pipeline. 30s.
5. **The journal.** A month of real data, totals, edit a date, watch it move. 40s.
6. **Close on why on-device matters** — privacy, cost, connectivity. 30s.

Rehearse it out loud four times. The jury *"sees your demo cold at the end"* — build
for someone who has not watched you get there.

---

## 11. Before the 8th — checklist

- [ ] **Decide the stack** (§6). Everything else depends on it.
- [ ] Make the GitHub repo **public**
- [ ] Build the deck — the only required attachment
- [ ] Yash submits (only the leader can)
- [ ] Join the WhatsApp community for run-of-show updates
- [ ] Book Chennai travel and stay

## Between the 9th and the 12th

- [ ] Get one on-device model running on **any** Android phone. Do not arrive having
      never deployed to an NPU.
- [ ] Download model weights to a laptop **and** a USB drive
- [ ] Install Office Kit on the laptop (`pc.vivoglobal.com`) and pair it once
- [ ] Write the Room/SQLite schema on paper — it is the same shape as the current one
- [ ] Prepare realistic seed data so the journal is not empty in the demo

# VaaniTrack at the iQOO Hackathon — Chennai City Battle

> ## 🏁 The event has passed — this is a record, not a plan
>
> **Status as of 18 September 2026.** Chennai ran on 12–13 September. Every date, deadline, instruction and unchecked box below is in the past; the checklists in §12 are **not** live TODOs. The document is preserved as written rather than re-tensed, because its value is the reasoning, not the schedule.
>
> **Read §5 as a plan for a different application.** As §2 states outright, the hackathon build was a native, on-device Android app — *"almost nothing ports as code."* **None of the features in §5 exist in this repo, and none were ever scoped to it:** no bank-SMS reconciliation, no udhaar ledger, no Tamil, no camera capture, no voice query, no streaming transcription, no offline inference. This file is not a backlog for the web app.
>
> **One conclusion outlives the event** and has been promoted into `CONTEXT.md` §20 so it is not lost here: **bank-SMS reconciliation needs native SMS permissions, which a web app and a PWA cannot get.** That makes the native route a genuine fork rather than a packaging choice.
>
> **A rejection that expired with the event:** §7 rules out Capacitor-wrapping the existing app, but only because carrying in prior work would have failed the originality rule. That reason no longer applies. Technically the option is open.
>
> **Two corrections, since they were wrong at the time of writing too** — see §10: the prototype URL `vaanitrack.vercel.app` has never existed, and the repo is still private.

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

Disclosure wording is in §10. If there is any doubt, one mail to
sameera@reskilll.com before the 8th removes it.

---

## 3. The positioning — this is the change that matters

"Voice expense tracker" does not survive screening. The category is a decade old and
there will be others in this track. The idea needs a wedge that is specific to India
and hard to argue with.

**Every fintech app in India reads your UPI and card feed. That feed has two holes.**

1. **Cash is invisible.** Vegetables, autos, chai, the maid, the kirana, the barber.
   None of it appears in any app. For most Indians it is a large share of daily
   spending, and it is precisely the spending nobody can account for at month end.
2. **Digital spends carry no reason.** Your bank knows `₹450 PAID TO SWIGGY`. It does
   not know it was a client lunch you will expense, or the third order this week.

Voice is the only interface that closes both holes at the moment money leaves your
hand. Typing is slower than spending. A camera needs a receipt that cash rarely
produces. Speech takes two seconds and works with your hands full.

> **VaaniTrack — the half your bank can't see.**

That reframe answers a screener's three questions in the order they ask them: *why
voice, why on-device, why India.*

**Why on-device follows for free:**

| Cloud today | On-device |
|---|---|
| Every capture needs a network | Works in a market, an auto, a basement |
| Financial data leaves the phone | Nothing leaves the phone — DPDP-safe by construction |
| Cost per transcription | Zero marginal cost, so it works for users who cannot be monetised |
| 2–4s round trip | Local latency |

Expense capture happens exactly where connectivity is worst. That is the pitch.

---

## 4. The thing judges will remember

Novelty is 20%. It is not "voice expense tracker". It is two things.

**a. The invisible half.** The reconciliation view in §5.1 — showing someone the money
their bank never saw — is the demo beat that reframes the product in one screen.

**b. The trust layer.** Every other AI demo on that floor will hallucinate
confidently. Ours refuses to.

- **Per-field provenance** — every field is marked `said` / `inferred` / `default` /
  `unknown`. The app can always say which parts you actually spoke and which it
  supplied.
- **A four-condition confidence gate**, not a score: the audio was heard well, the
  extractor did not flag ambiguity, an amount exists, and the amount was *said* not
  inferred. All four, or it goes to review instead of saving.
- **Principle 0 — never record a wrong transaction.** A wrong amount is caught
  immediately; a wrong date files a real expense under a day nobody revisits.

Deliberately mumbling on stage and having the app *decline to guess* is thirty
seconds no other team will spend. Spend it.

---

## 5. Feature slate

Ranked by what each buys against the rubric, per hour of build.

### 5.1 The invisible half — cash vs digital reconciliation · **the differentiator**

- Read UPI and bank SMS **on-device** → auto-capture digital spends
- Voice captures the cash the SMS feed never sees
- One screen: *"Your bank saw ₹12,000 this month. You spent ₹19,400. Here is the
  ₹7,400 nobody was tracking."*

Novelty: highest of anything here. Demo: it reframes the product in a single screen.
Effort: moderate — SMS parse is a regex shortlist plus the same on-device extractor.

**Practical catch:** the loaner phone will have no bank SMS history. Either seed a
demo inbox, or send the phone two or three realistic bank messages from another
handset during setup. Decide this before Saturday; do not discover it at the table.

### 5.2 Vernacular voice — and demo it in Tamil

- Hindi, Hinglish and Tamil. `"dhai sau"`, `"ek lakh"`, `"sau rupaye"`
- Whisper is multilingual already, so this is mostly prompt and number handling

We are in **Chennai**. Speaking Tamil to the phone on stage, in Chennai, is a local
move nobody else will make, and it is the single cheapest novelty point on this list.
The track brief literally says *"built for how India actually transacts."*

### 5.3 Voice khata — udhaar, receivables and payables

- `"Ramesh ne paanch sau udhaar liye"` → a receivable, not an expense
- `"Maine Suresh se do hazaar liye"` → a payable
- Settle by voice: `"Ramesh ne wapas de diye"`

KhataBook and OkCredit are billion-dollar companies built on exactly this ledger,
and neither is voice-first. It is the most India-specific idea on the list and it
widens the product from "expenses" to "money owed in both directions" — which is how
Indian households and small shops actually think.

Effort: an extraction-schema extension plus a second ledger view. Cheaper than it
sounds, because the capture pipeline is unchanged.

### 5.4 Camera — receipts and UPI screenshots

- Point at a receipt or a UPI confirmation screen → on-device OCR → same pipeline

Creative phone use is 15% and the rubric names *camera* explicitly. This is also how
you demo the digital side live without needing real bank SMS on a loaner phone:
photograph a UPI screenshot from another phone on stage.

### 5.5 Ask your money — voice query over the ledger

- *"How much on food this month?"* · *"Who owes me money?"* · *"What did I spend in Chennai?"*

Puts the on-device LLM to a **second** use, which is a real technical-depth argument
rather than a claim. Converts the app from a recorder into something you consult.

### 5.6 Live streaming transcription

Words appearing on screen *as you speak*, with the network off. Nothing else proves
local inference so immediately — a cloud app visibly cannot do it. Cheap novelty for
the demo, moderate implementation cost.

### 5.7 The offline proof

Airplane mode toggled on stage, before you speak. See §11.

### If ahead of schedule

- **On-device semantic search** — embed rows with a small ONNX embedding model so
  *"medical"* finds chemist, doctor, Apollo, medicines. A third NPU workload.
- **Spend-consciousness nudge** — *"3rd chai today · ₹90 this week"* after a save.
  Warm, behavioural, almost free.
- **Budget alerts**, **household shared ledger** — only if everything else is done.

### Cut ruthlessly

A working simple product beats a broken complex one — the rubric says so in as many
words. If time runs out, ship **5.1 + 5.2 + 5.7** and drop the rest without regret.

---

## 6. End-to-end, which is what "product" means here

| Stage | How |
|---|---|
| Capture | Voice (offline) · camera (receipt / UPI screenshot) · SMS auto-read |
| Verify | Provenance, confidence gate, review card, undo |
| Store | On-device Room / SQLite. Nothing leaves the phone |
| Recall | Journal — day sections, month totals, edit, delete |
| Understand | Cash vs digital split · category breakdown · voice query |
| Act | Settle udhaar · budget nudges |

Six stages, one screen each. That is a product, not a demo.

---

## 7. Stack — the one decision to make before the 8th

Every entry must run and pitch on the phone. The NPU is the explicit target.

| Option | Upside | Downside |
|---|---|---|
| **A. Native Android** (Kotlin + Compose) | Real NPU access. Best on Technical Depth (15%) and Creative Phone Use (15%). Unambiguous for HackTracker telemetry. SMS and camera are native APIs. | Full build. Needs real Android skill. |
| **B. Capacitor wrap** of the existing React app | Fastest to something demoable | This *is* carrying in the app. Fails the originality rule. |
| **C. PWA + WebGPU** (`transformers.js`) | Reuses web skills | No NPU. Browser support on OriginOS 6 unverified. **No SMS access, so 5.1 is impossible.** |

**Recommendation: A.** We rebuild either way, so build the version that scores — and
note that the differentiator in §5.1 needs native SMS access, which rules out C.

**The gating question, answer it today:** *does anyone on this team ship Android?*
The form asks for Android and LLM proficiency, so shortlisting weighs it. If the
honest answer is no, take C, drop 5.1, and win on product quality and novelty
instead. Choosing A with no Android experience is how a team spends 30 hours
fighting Gradle.

**Practical notes**

- The phone is a **loaner handed over at Saturday check-in**. Nothing pre-installed.
  Budget for model download or sideload time.
- Carry model weights on a laptop **and** a USB drive.
- Published mentor and jury lists are **Bengaluru's**; Chennai's panel is not
  announced. If Qualcomm DevRel is on the floor, that is the first person to find.
- Office Kit is 10%, read from telemetry, not self-reported. Use it constantly. Free marks.

---

## 8. The 30 hours

Clock starts Sat 10:00, hacking 11:00, awards Sun ~16:15. 55% of build time is Red
Light (phone only, via Office Kit).

| Window | Goal |
|---|---|
| Sat 11:00–15:00 | **Skeleton + ASR on device.** Record → transcript on screen. Nothing else matters until this works. |
| Sat 15:30 | Mentor round — bring the NPU deployment problem, whatever it is |
| Sat 15:00–19:00 | **Extraction + trust layer.** Transcript → fields with provenance → gate → review card |
| Sat 19:00–22:00 | **Eval Round 1** — scored. Have the voice path working end to end, even if ugly |
| Sat 22:00–02:00 | **Journal + persistence.** Room/SQLite, day grouping, totals, edit, delete |
| Sun 02:00–06:00 | **The invisible half** (5.1) + camera (5.4) |
| Sun 06:00–09:00 | Polish, seed realistic data, **feature freeze** |
| Sun 09:00 | **Eval Round 2** — demo on the phone at the table |
| Sun 09:00–13:30 | Rehearse. No new code. |
| Sun 13:45 | **Top 10 pitches** — 3–5 minutes live |

**Freeze at 06:00 and mean it.** Teams lose here by shipping a broken feature at 08:00.

---

## 9. Earning each rubric line

| Line | Weight | How |
|---|---|---|
| End product quality | 30% | Works offline, end to end; the journal makes it something you'd keep using |
| Novelty and impact | 20% | The invisible half + the trust layer. Financial inclusion is real, not claimed |
| Creative phone use | 15% | Voice **and** camera **and** on-device AI — all three named categories |
| Technical depth | 15% | NPU inference used twice (ASR + extraction), offline-first, on-device DB |
| Office Kit usage | 10% | Use it constantly and honestly — telemetry, not a claim |
| Demo and presentation | 10% | §11 |

---

## 10. Phase 1 submission — paste-ready

**Idea title**

```
VaaniTrack — the half your bank can't see
```

**Description**

```
Every fintech app in India reads your UPI and card feed. That feed has two holes.

Cash is invisible. Vegetables, autos, chai, the maid, the kirana. None of it
reaches any app, and it is a large share of what most Indians actually spend.
And digital spends carry no reason: your bank knows "450 paid to Swiggy", not
that it was a client lunch you will expense.

VaaniTrack closes both holes with the one interface fast enough to use at the
moment money leaves your hand — speech. "Two fifty for lunch, five hundred for a
book" becomes two verified transactions with amount, description, category,
payee and date. It reads your bank SMS on-device for the digital side, and shows
you the reconciliation: what your bank saw, what you actually spent, and the gap
nobody was tracking.

Whisper and a small instruct model run on the Snapdragon NPU, so it works with
no network at all and no financial data ever leaves the phone.

The core is a trust layer. Every field carries provenance — said, inferred,
defaulted, or unknown — and a four-condition confidence gate decides whether to
save silently or ask. A wrong transaction is worse than no transaction, so when
the app is not sure, it says so instead of guessing.

Hindi, Hinglish and Tamil throughout. Camera capture reads receipts and UPI
screenshots through the same pipeline. Voice queries answer "how much on food
this month" and "who owes me money" — because udhaar is money too.
```

**Prototype URL** — ~~`https://vaanitrack.vercel.app`~~
The repo is currently private. **Make it public before submitting**, or the link
proves nothing to a screener.

> **▸ Correction (18 Sept).** That URL was never live — no Vercel deployment of
> VaaniTrack has ever existed, then or now. Only a local `.env.vercel` was ever
> prepared. The repo also remains private. Anything that went out citing this
> link pointed at nothing.

**Deck** — required. The only mandatory attachment.

**Prior builds & hackathons** — each member fills their own, honestly.

**What makes you and your team stand out**

```
We have already built and shipped a working version of this idea and tested it
on real devices, so we are not starting from a hypothesis. That build surfaced
the failures that actually matter in voice capture — recordings that are
completely silent yet look healthy to every available metric, transcription
models that answer quiet audio with confident stock phrases, microphones that
emit digital silence for over a second after the browser hands over the stream.
We found each of those by instrumenting the pipeline and measuring, not by
guessing, and we fixed them.

That is why our proposal is a trust layer rather than a demo. We know what this
category gets wrong, because we have already been wrong in each of those ways.

Chennai is where we move the intelligence onto the phone and close the half of
the ledger no bank app can see.
```

**Originality checkbox** — tick it, and disclose plainly:

```
Pre-existing component disclosed: a web prototype of this idea
(github.com/PranavChhajed/VaaniTrack), built before the event using cloud APIs.
The Chennai build is a new native Android application with on-device inference;
the prior work contributes the product specification and design, not code.
```

---

## 11. The pitch — 3 to 5 minutes

1. **Open on the hole, not the app.** "Your bank app thinks you spent twelve
   thousand rupees last month. You spent nineteen. Nobody can tell you where the
   rest went." — 25s
2. **Airplane mode on, on stage.** Show the toggle. Speak an expense in Tamil. It
   lands. This is the moment that wins the room. — 60s
3. **The reconciliation screen.** Bank saw this. You spent that. Here is the gap. — 45s
4. **The trust layer.** Mumble something deliberately. It declines to guess and asks.
   Then show provenance on a saved row. — 45s
5. **Camera.** Point at a receipt. Same pipeline. — 25s
6. **Ask it something.** "How much on food this month?" — 20s
7. **Close on why on-device.** Privacy, cost, connectivity — in that order. — 30s

Rehearse out loud four times. The jury *"sees your demo cold at the end"* — build for
someone who has not watched you get there.

---

## 12. Before the 8th

> **▸ Closed out (18 Sept).** Both checklists below are past. The unticked boxes
> record what the plan called for, not work still outstanding — nothing here is
> actionable now. Two of them were never done and are worth naming: the repo was
> never made public, and no on-device model was ever run in this repo. No Android
> code was committed here at any point, which is consistent with the Chennai build
> happening entirely outside this codebase, as §2 intended.

- [ ] **Decide the stack** (§7). Everything depends on it.
- [ ] Make the GitHub repo **public**
- [ ] Build the deck — the only required attachment
- [ ] Yash submits (leader only)
- [ ] Join the WhatsApp community
- [ ] Book Chennai travel and stay

## Between the 9th and the 12th

- [ ] Get **one** on-device model running on any Android phone. Do not arrive having
      never deployed to an NPU.
- [ ] Model weights on a laptop **and** a USB drive
- [ ] Install Office Kit (`pc.vivoglobal.com`) and pair it once
- [ ] Decide how bank SMS gets onto a loaner phone for the 5.1 demo
- [ ] Write the Room/SQLite schema on paper — same shape as the current one
- [ ] Prepare seed data so the journal is not empty on stage

# VaaniTrack — Research Findings

**Date:** 2026-09-05
**Purpose:** Evidence for the decisions taken on 2026-09-05 and for those still open.
**Method:** Web research across academic ASR literature, competitor products, and industry retention data. Sources listed at the end.

---

## Executive summary — the five things that matter

1. **The single worst thing ASR does is recognise currency amounts.** Baseline accuracy on currency amounts is **36.3%** — the lowest of every numeric category tested. Your highest-stakes field is the model's weakest field. This is the central engineering fact of the product.

2. **It is fixable, but only deliberately.** Fine-tuning on numeric data lifts currency accuracy from 36.3% to **98.5%**. An LLM-cascaded approach (transcribe, then have an LLM interpret) reaches **95.6%**. Neither happens by default.

3. **The category is crowded — far more than your source document assumed.** At least ten voice expense trackers are live in 2026, including one Indian competitor already doing voice logging in *all Indian languages* plus receipt OCR. "Voice expense tracker" is not a position.

4. **Your closest competitor already made your hard decision — the other way.** Peggy shows the parsed result and requires the user to review before saving. Their stated reason: it "prevents silent errors." The market has partially converged on confirm-before-save.

5. **The retention evidence supports your hypothesis, with one serious caveat.** Manual-entry fatigue is widely reported as the primary cause of abandonment, and most people quit within 3–4 weeks. But voice lowers the *cost* of each entry without removing the *discipline* of remembering to log at all — and competitors using SMS/bank auto-import bypass discipline entirely.

---

## 1. ASR reality check — the numbers

### 1.1 Currency amounts are the worst-performing numeric category

From *Handling Numeric Expressions in Automatic Speech Recognition* (arXiv 2408.00004):

| Numeric type | Baseline ASR | Fine-tuned ASR | LLM cascade (GPT-4o) |
|---|---|---|---|
| Years | 97.4% | 97.7% | — |
| Quantities | 93.3% | 99.4% | — |
| **Currency amounts** | **36.3%** | **98.5%** | **95.6%** |
| Timestamps | 3.4% | 75.9% | 83.8% |
| *Average* | — | 92.9% | 93.6% |

**What this means for VaaniTrack.** The amount is the one field where an error is unrecoverable — a wrong category is a shrug, a wrong ₹250 is a corrupted financial record. And it is precisely the field a general-purpose ASR handles worst. Off-the-shelf transcription will not meet your "never record a wrong transaction" bar.

**Two viable paths**, both established in the literature:
- **Fine-tune on numeric/currency data** → 98.5%, lower latency, lower inference cost
- **LLM cascade** (transcribe → LLM interprets the financial meaning) → 95.6%, more flexible, higher latency

Note that the second path is what your product concept already describes — "the goal is not speech-to-text, it is understanding the financial meaning." The research supports that architecture on accuracy grounds, not just product grounds.

**A useful aside:** timestamps score **3.4%** at baseline — the worst figure in the table by a wide margin. Your decision to drop time as a v1 requirement is independently supported by the data. Capturing time reliably would have been the hardest thing in the product.

### 1.2 Indian-accented English

From *Svarah: Evaluating English ASR Systems on Indian Accents* (arXiv 2305.15760) — 9.6 hours, 117 speakers, 65 locations across India:

- Whisper outperformed all other models, at **11.2% WER** on real-world use cases
- Whisper **medium and large** achieve single-digit WER — described as "encouraging"
- But the paper notes their size "may make them difficult to deploy in the Indian context"
- The gap between Svarah and native-English benchmarks ranges from **5.65 to 43.03** points depending on model

Broader industry benchmarks: best-in-class models reach 95–98% word accuracy on *clean* audio, but WER rises to **30–50% for accented speech** versus 2–8% for native speakers on the same task.

**What this means.** Indian-accented English is workable *if* you use a large Whisper-class model — but the accent penalty is real and compounds with the currency-amount weakness. Your source document deferred accent handling to "after the core is robust." The data suggests accent robustness *is* the core, given an Indian first market.

### 1.3 One technique worth knowing

Combining multiple ASR engines dropped WER from a single-engine range of **3.68%–47.67%** down to **2.12%**. Ensembling is expensive but it is the strongest known lever if the accuracy bar cannot otherwise be met — and it doubles as a natural confidence signal (engines disagreeing = low confidence).

---

## 2. The confidence problem — how to actually decide "infer vs. confirm"

Your stated goal — *infer aggressively, but never record a wrong transaction* — is exactly the problem the "selective prediction" literature addresses. Findings:

- **Do not trust token log-probabilities.** On a 55-field invoice benchmark where frontier LLMs failed on 26% of fields, mean log-probability achieved only **0.705 ROC AUC** as a correctness predictor. It is a weak signal.
- **Self-consistency is the strongest general-purpose confidence signal** — parse the same utterance more than once and check whether the answers agree. Highest AUROC on 7 of 8 datasets tested, **up to 0.82**.
- **Multi-signal beats single-signal.** Recent work combines distribution, stability, and consistency signals and averages them.
- **Per-field selective risk control is the right frame.** The literature explicitly treats this as: route low-confidence *fields* to human review while auto-accepting the rest, maximising automation without paying for errors.

**This resolves your central tension.** "Infer aggressively" and "never record wrong" are only contradictory if confidence is treated as one number for the whole transaction. Treated **per field**, with different risk weights per field, they are compatible:

| Field | Cost of an error | Policy implied |
|---|---|---|
| **Amount** | Severe — corrupts the record | Highest bar. Confirm on any doubt. |
| **Payee / person** | High — wrong person is a real error | High bar. Confirm when unclear. |
| **Description** | Low — user's own words, easily read later | Infer freely. |
| **Category** | Low — cosmetic, easily fixed later, and you have already accepted null | Infer freely; leave blank rather than guess. |
| **Payment method** | Medium — but a default covers it | Take the default; confirm only if contradicted. |
| **Date** | Medium | Infer "today" freely; confirm only on odd relative dates. |

That table is the mechanism by which you get both of the things you asked for.

---

## 3. Competitive landscape — considerably more crowded than assumed

Live voice expense trackers found in 2026:

| Product | Notable positioning |
|---|---|
| **Kharcha** (kharcha.ind.in) | **India-focused.** Voice logging in *all Indian languages*, receipt OCR, AI assistant, budgets, forecasting. Freemium. |
| **Mera Kharcha** | India-focused, AI expense manager, SMS-based |
| **Peggy** | "Say your expenses, AI logs them in 3 seconds." Gemini categorisation. **Review-before-save.** |
| **TalkieMoney** | GPT-based voice assistant for budgeting |
| **ExpenseEasy** | Whisper-based, "nearly any language" |
| **Receiptix** | Voice + receipt, multi-currency, picks up currency when abroad |
| **MonAi** | Voice + plain-language typing + automation |
| **Say** | Voice in 99+ languages **plus SMS auto-import from bank notifications** |
| **Vocash** | Voice-first daily capture |
| **Finny**, **VoiceExpense** | Voice capture, content-marketing heavy |

### What this changes

**The Indian voice-expense niche is occupied.** Kharcha already ships voice logging across Indian languages with OCR and an AI assistant. Your v1 — English-only voice capture — is a strict subset of a shipping competitor's feature set. That is not fatal, but it means differentiation cannot come from *what* you capture; it has to come from *how well* the capture interaction works.

**Your source document's instinct was right.** "Our app lets you record expenses with your voice" is not a position. The research confirms it emphatically.

**Where the gap actually is.** Every competitor found describes capture. None describes:
- conversational correction across turns ("actually, the coffee was 180")
- ambiguity resolution with minimal tappable choices
- explicit provenance — knowing which fields were said, inferred, defaulted, or unknown
- a stated guarantee about never recording a wrong transaction

Those four are your product's actual differentiators, and they are the four hardest things in your spec. That is a coherent position: **the voice expense tracker that doesn't get it wrong** — but only if the correctness claim is real and demonstrable.

### The competitor decision worth studying

Peggy's flow: *"You review the result, correct it when needed, and save."* Their stated rationale is that the review step "prevents silent errors." They explicitly prioritise **control over automation**.

This is the opposite of "infer aggressively and record silently." One of you is wrong about what users want — or the answer differs by field, which is what §2 argues. Worth noting that Peggy also offers text entry and receipt photos as fallbacks for noisy environments, and openly concedes results "depend on background noise, accent, merchant names, and the parsing model."

---

## 4. Retention evidence — does the core hypothesis hold?

**Supporting your hypothesis:**
- Manual-entry fatigue is consistently named as the primary cause of expense-tracking failure
- Most people who try manual tracking stop within **3–4 weeks**
- The reported failure pattern matches your description exactly: track diligently for a week or two, miss one entry, the record feels incomplete, the whole thing is quietly abandoned
- Habit research cited in this space holds that behaviours requiring **more than two steps to initiate** fail to stick without strong motivation
- Lower-friction tracking methods are maintained longer

**The caveat you should take seriously:**

The same literature contains a direct challenge to the premise: *"If a system requires daily discipline to work, it fails precisely for the people who need it most. The real bottleneck is consistent human effort, not app features."*

Voice reduces the **cost** of an entry. It does not remove the **requirement to remember to make one**. A user who forgets to log is equally unserved by a form and by a microphone.

This is why the **Say** app's approach matters: SMS auto-import from bank notifications removes the discipline requirement altogether. On the friction axis alone, automatic import beats voice — voice is a faster way to do a thing you must still remember to do.

**Implication.** Your hypothesis H1 (friction causes abandonment) is well supported. H3 (voice reduces friction *enough*) is not established, and faces a competing solution that reduces it further. The strongest honest framing of your bet is:

> Voice wins where automatic import cannot reach — **cash, informal payments, split context, and the description of what a transaction was actually for.** A bank SMS knows ₹250 left your account. It does not know it was lunch.

That is a defensible and genuinely differentiated position, and it happens to be the one your Indian market makes strongest, because cash and UPI-to-person payments carry no useful merchant metadata.

---

## 5. Risks the research surfaced that were not in the PRD

| # | Risk | Evidence |
|---|---|---|
| R9 | **Currency-amount recognition is the weakest link in the stack** and sits on your highest-stakes field | 36.3% baseline accuracy |
| R10 | **Accent penalty compounds with the amount problem** — both hit the same utterance | Svarah gap of 5.65–43.03 points |
| R11 | **Automatic bank/SMS import is a stronger friction solution** on paper, and is already shipping in a competitor | "Say" app; retention literature |
| R12 | **An Indian competitor already ships a superset of your v1** | Kharcha: all Indian languages + OCR + AI assistant |
| R13 | **Large Whisper-class models are hard to deploy in the Indian context** — the paper says so directly, which implies either server-side inference cost or an on-device accuracy compromise | Svarah paper |
| R14 | **Indian numeric speech has forms English ASR may not expect** — "dhai sau", lakh/crore, and code-switched numerals appear even in otherwise-English speech | Inference from code-switching literature; **not directly tested — worth validating** |

---

## 6. What the research recommends you do next

Not decisions — recommendations, for you to accept or reject.

1. **Benchmark before building.** Record 100–200 real utterances from your intended users, in real conditions, and measure amount accuracy specifically. Everything in this document says that number will be worse than you expect.
2. **Architect as transcribe → interpret**, not transcribe-and-parse. The LLM-cascade result (95.6% on currency) supports what your product concept already wanted.
3. **Implement confidence per field, not per transaction.** Use self-consistency rather than log-probabilities.
4. **Position on correctness, not on voice.** Voice is table stakes in this category as of 2026.
5. **Decide where you stand against auto-import.** The cash/informal/context argument in §4 is, on this evidence, your strongest strategic ground.

---

## Sources

**ASR and numeric accuracy**
- [Handling Numeric Expressions in Automatic Speech Recognition (arXiv 2408.00004)](https://arxiv.org/html/2408.00004v2)
- [Svarah: Evaluating English ASR Systems on Indian Accents (arXiv 2305.15760)](https://arxiv.org/pdf/2305.15760)
- [How accurate is speech-to-text in 2026? — AssemblyAI](https://www.assemblyai.com/blog/how-accurate-speech-to-text)
- [Word error rate is broken — AssemblyAI](https://www.assemblyai.com/blog/word-error-rate-is-broken)
- [Digits micro-model for accurate and secure transactions (arXiv 2402.01931)](https://arxiv.org/pdf/2402.01931)
- [Measure and improve speech accuracy — Google Cloud](https://docs.cloud.google.com/speech-to-text/docs/v1/speech-accuracy)

**Confidence and selective prediction**
- [Beyond Logprobs: A Multi-Signal Confidence Engine for LLM-Based Document Field Extraction](https://arxiv.org/pdf/2606.24420)
- [Valid Per-Field Selective Risk Control for Document Extraction](https://arxiv.org/html/2608.14639)
- [Reliable Financial Named Entity Recognition under Domain Shift](https://arxiv.org/html/2608.19558)
- [Ordinal Gates, Cardinal Bets: Matching LLM Confidence to the Financial Decision Operator](https://arxiv.org/html/2609.00187)

**Competitors**
- [Kharcha — Expense Tracker for India](https://kharcha.ind.in/)
- [Mera Kharcha](https://merakharcha.in/)
- [Peggy — Voice Budget App](https://getpeggy.app/voice-budget-app)
- [TalkieMoney](https://talkiemoney.com/en/)
- [ExpenseEasy](https://www.expenseeasy.app/voice-expense-tracking)
- [Receiptix](https://receiptix.io/voice-expense-tracker)
- [MonAi](https://get-monai.app/)
- [Say](https://www.sayapp.net/)
- [Vocash](https://www.vocash.app/ai-expense-tracking)
- [Finny — Voice Expense Tracker](https://getfinny.app/blog/voice-expense-tracker)

**Retention and abandonment**
- [Why People Quit Budgeting Apps in 30 Days — SpendTrak](https://spendtrak.app/blog/why-people-quit-budgeting-apps)
- [Why Budget Apps Don't Work — DEV](https://dev.to/dhg/stop-building-budget-apps-expense-tracking-isnt-the-fix-18k6)
- [How Great Budget App Design Increases User Retention — OneThing](https://www.onething.design/post/budget-app-design)
- [AI Expense Tracker vs Manual — Finny](https://getfinny.app/blog/ai-expense-tracking-vs-manual)

**Voice UI confirmation patterns**
- [Voice UI Design Guide 2026 — Fuselab Creative](https://fuselabcreative.com/voice-user-interface-design-guide-2026/)
- [Voice AI in Banking — Telnyx](https://telnyx.com/resources/voice-ai-banking-data)

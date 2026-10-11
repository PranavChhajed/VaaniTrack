# The voice pipeline, round two: faster and checked twice

| | |
|---|---|
| **Status** | Built on branch `feature/voice`. **Not merged.** The English test set has not been recorded yet, so the audio half is unmeasured (see "Not done") |
| **Date** | 11 October 2026 |
| **Follows** | [`SPEED-ACCURACY.md`](SPEED-ACCURACY.md), which found that extraction is the slow part and that Whisper cannot be tuned further by configuration |
| **Goal** | Voice capture that is fast and right, English first; Hindi is a separate, later phase |

The method is the point. Nothing here counts as better because it feels better: every
change is scored on the same cases, with **silent financial errors counted
separately** (a wrong amount the app would have saved without asking). One of those
is disqualifying.

---

## 1. What the record said (201 spoken captures, before any change)

| Finding | Number |
|---|---|
| Spoken takes accepted by the transcriber | 121 of 201 (60%) |
| Rejected: no amount in what was heard | 43 |
| Rejected: a stock phrase ("Thank you.", "Subtitles by...") | 21 |
| Rejected: too small, or no speech | 13 + 3 |
| Tap-to-result, p50 / p90 (27 captures with every timing) | 2,760 ms / 3,628 ms |
| ...of which transcription | 374 ms |
| ...of which extraction | 1,613 ms |
| ...of which everything else (upload, the hop from the edge to the function, start-up) | 783 ms p50, 1,425 ms p90 |

Two things in the rejected rows matter more than their count:

- **A lot of "no amount" takes are real speech with the number misheard, on a very
  quiet recording.** "Too hefty for lunch" is "two fifty for lunch". The levels on those
  rows (mean -40 to -48 dBFS) are far below a normal take. This is a capture problem,
  not an extraction one, and it is what the lab's boosted-versus-plain recording is for.
- **`hasNumber` in `asr.ts` stopped at "twelve".** "Chai was fifteen rupees" was rejected
  as having no number in it. Fixed (section 3).

The Groq edge answers from Mumbai but the function runs in Virginia (`bom1::iad1`),
and Groq's own servers are in Dallas, so the function belongs where it is. The ~0.6 s
for even a trivial request is the edge-to-function hop plus start-up.

## 2. The scoreboard

`scripts/eval.ts` runs written cases (`qa/voice-cases.json`, built from
`docs/voice_transaction_100_test_cases.md` by `scripts/build-voice-cases.mjs`, plus
35 more in `qa/voice-cases-extra.json`, among them the sentences that failed in real
use) through the real extraction code and scores each as:

`correct` / `asked` / `correct_review` (right but asked unnecessarily) / `wrong_flagged`
(wrong, but sent to review: the gate did its job) / `missed` / **`guessed`** (an ambiguous line answered with a confident entry) /
**`silent_field_error`** / **`silent_amount_error`**.

"Saved without asking" is decided by `gateFailures`, the app's own function. Run:

```
npx tsx --env-file=.env.local scripts/eval.ts text --pipeline v1                 # what shipped
npx tsx --env-file=.env.local scripts/eval.ts text --pipeline v2 --model X       # values-only extractor
npx tsx --env-file=.env.local scripts/eval.ts text --pipeline pipeline           # the whole route
npx tsx --env-file=.env.local scripts/eval.ts diff baseline final2
npx tsx --env-file=.env.local scripts/eval.ts audio --session s-2026-10-12 --variant plain
```

Audio mode reads the recordings the lab saved (`/lab`), transcribes them with the real
`transcribeAudio`, and scores them the same way, plus whether every expected amount
was among the numbers heard. Results are cached on the audio and the prompt, and
failures are never cached.

## 3. What was built

| Piece | File | What it does |
|---|---|---|
| Amount reader | `src/lib/amounts.ts` | Reads amounts from a transcript with no model: digits, `₹`/`Rs`, `2.5k`, `lakh`, "two fifty", "twelve fifty", "fifteen hundred", "two and a half thousand", "$2.50" read as 250, and Hindi forms the prompt already claimed (dhai sau, dedh, sava, paune, saadhe, aadha). 91 checks. Replaces `hasNumber` |
| Day reader | `src/lib/dates.ts` | The model only quotes the words said about the day (`dateWords`); this works out the date from the speaker's own date. Yesterday, last Friday, three days ago, 3rd September, in any timezone. Unblocks the 41 spoken-date cases |
| Finishing step | `src/lib/finish.ts` | Everything that is a judgement, made in code against the transcript: said or inferred, the amount cross-check (a disagreement becomes a question, never a silent save), the day, the payment per expense, a missing amount filled from the one number in the words |
| Values-only prompt | `src/lib/extract2.ts` | Asks the model for values only, no provenance, no dates, no defaults. The reply is about a quarter the length, and the prompt never changes so it can be cached |
| Plain-sentence route | `src/lib/quick.ts` | "250 lunch", "two fifty chai paid cash", "400 on dinner yesterday": answered by code in milliseconds. Takes a sentence only if every word is accounted for |
| The route | `src/lib/pipeline.ts` | quick, then the fast model, then the careful model if the fast answer fails a check or the fast model is unavailable. `VOICE_PIPELINE=v1` is the old route, one setting away |
| Warm-up | `src/lib/warm.ts`, `OPTIONS` in the route, `CaptureClient.warm()` | A tiny request as recording starts, so an idle function is awake by the time the audio arrives |
| The lab | `/lab`, `/api/lab` | Behind the portal password. Reads a line, records it twice at once (plain, as the app does, and boosted) and files both |

## 4. Results

### Extraction on the 120 written cases (the same cases, three ways)

| | Right | Silent amount errors | Silent field errors | Guessed | Extraction p50 |
|---|---|---|---|---|---|
| **v1: what shipped** (`gpt-oss-120b`, everything in one reply) | 96 / 110 | **3** | 3 | 4 | 2,025 ms |
| v2, same model | 133 / 145\* | 0 | 2 | 3 | 975 ms |
| v2, `qwen/qwen3.8-27b` | 134 / 145\* | 0 | 0 | 0 | 435 ms |
| v2, `gpt-oss-20b` (low) | 134 / 145\* | 0 | 4 | 1 | 706 ms |
| **The whole route** (quick, then qwen, then `gpt-oss-120b`) | 128 / 145\*\* | **0** | **0** | **0** | **414 ms** |

\* 145 scored cases includes the 35 extra ones; v1 was scored on the original 110, so the first row is not the same denominator.
\*\* 16 cases came back as errors, **every one a rate limit** (section 6), not a wrong answer. Of the 129 that were answered, all are right, correctly asked, or wrong-but-flagged (one, a Hindi number the reader could only partly read).

By route, on the written cases: **82 of 155 answered by code (p50 0 ms)**, 32 by the fast model (p50 454 ms), 15 needed the careful one behind it (p50 1,699 ms).

The three silent amount errors in the old route were all Hindi number phrases the
model misread: "dedh sau" (150) saved as 250, "paune do sau" (175) as 200, "chhe sau
pachhattar" (675) as 665. The amount reader now reads the first two itself, and
flags the third for review.

### The plain-sentence route on real data

| | |
|---|---|
| Written cases it takes | 83 of 155 (54%), **0 wrong accepts** |
| Real transcripts it takes (121 accepted spoken captures) | 37 (31%), and it agrees with what the model returned on all 37 |

### Rejected by experiment (kept as a record, as the earlier round did)

- `gpt-oss-20b` as the fast model: the same accuracy as qwen on this set, but 4 silent field errors and a guess, and slower.
- Letting the model keep writing provenance and dates: 2-3 times the reply length for nothing the code could not check.
- `reasoning_effort: "none"` on qwen: the call hung for 15 s. Qwen needs no setting.

## 5. Rules these changes hold to

- **Never record a wrong transaction.** Every new check can only send more to review.
  The amount is read twice (model, then code); an entry is saved without asking only if
  they agree and the model did not ask a question.
- **Each risky behaviour has one switch**: `VOICE_PIPELINE=v1`, `VOICE_QUICK=0`,
  `GROQ_FAST_MODEL=` (empty to skip the fast model).
- **A fast-model failure costs nothing but time**: any error, timeout (4 s), or a
  failed check goes to the careful model.

## 6. The free tier is now the constraint

Found by exhausting it. Each Groq model on this account allows **8,000 tokens a minute,
1,000 requests a day, and 200,000 tokens a day**. A request reserves its prompt plus the
longest reply it might write, and the extraction prompt is about 1,000 tokens, so:

- about **5 model-answered captures a minute** per model, and about **140 a day**;
- the scoreboard's runs used the whole day's allowance, on the key production also uses.
  While it recovers (a rolling window, hours), voice and typed extraction in the app
  return "Hit the API rate limit".

What this changes:

- The plain-sentence route is worth far more than its speed: every capture it answers
  costs **no tokens**.
- A shorter prompt doubles the daily capacity. It was not done here because testing it
  needs the allowance that was spent; it is the first thing to do once it is back.
- **Evaluation must not share a key's allowance with the app.** The quota is per
  organisation, so a second key does not help; the Groq developer tier (pay as you go) or a
  separate account does.

## 7. Not done, and why

- **The recorded test set.** It needs about 40 minutes of the person's own voice. The lab
  is built and deployed on the branch preview (`/lab`, the portal password); until the
  recordings exist, nothing about the transcriber, the ASR prompt, the decision rules,
  or whether boosting a quiet voice helps can be measured, and none of it is changed.
- **Phonetic rescue of misheard numbers** ("too hefty for lunch"): the safe version is a
  suggestion, never a save, and it needs the real recordings to judge.
- **Correction by voice** ("make that 300"): a feature, not a speed or accuracy fix; the
  10 correction cases stay `blocked`.
- **The end-to-end speed on a real phone.** The scoreboard times the model stages;
  `scripts/route-timing.mjs` times the real route with real recordings, and the app logs
  `total_ms` for every capture. Neither could be read after the allowance ran out.
- **Hindi** (the second phase). The Hindi forms the reader knows are the ones the prompt
  already claimed; full Hindi number speech, script handling and a Hindi test set are
  not started.

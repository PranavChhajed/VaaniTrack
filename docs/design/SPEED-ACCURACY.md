# Speed and accuracy — what a month of use showed

| | |
|---|---|
| **Status** | Built |
| **Date** | 10 October 2026 |
| **Continued in** | [`VOICE-PIPELINE.md`](VOICE-PIPELINE.md) (11 October): the plain-sentence route, the values-only extractor, the scoreboard |

---

## 1. The report

After five weeks of daily use, three complaints:

1. The app opens on the journal. It should open on capture.
2. Voice is slow, and it is often wrong.
3. The calendar should show what each day cost.

## 2. What the record said

Every stage of a capture is logged (`lib/observe.ts`), so the complaints could be checked against 157 real captures rather than taken on feel.

| Finding | Evidence |
|---|---|
| Voice often produced nothing | 133 spoken attempts, 81 accepted. 25 rejected for no amount, 13 as stock phrases ("Thank you."), 13 as silence, 1 as no speech |
| Voice was often wrong when it did | Of 145 auto-saved expenses, 19 were undone and 31 deleted. Only 6 ever went to review |
| Voice was abandoned | From 28 September: 2 spoken captures, 20 typed |
| The wait was not measured | Extraction was timed (median 1.7s spoken, about 3s typed). Transcription was not timed at all, and nothing recorded tap-to-result |

## 3. Decisions, and how each was checked

`scripts/replay.ts` runs the stored recordings and transcripts through candidate settings, using the same code the app runs, and scores them against what the user went on to keep. Nobody labelled anything by hand; the file comment explains how truth is derived.

### Transcription: nothing changed

103 stored recordings, four setups.

| Setup | Median | Kept captures still right (of 45) |
|---|---|---|
| `whisper-large-v3`, current prompt | 259ms | **43** |
| `whisper-large-v3` + journal vocabulary | 275ms | 36 |
| `whisper-large-v3-turbo` | 239ms | 30 |
| `whisper-large-v3-turbo` + journal vocabulary | 237ms | 30 |

- **Transcription was never the slow part.** A quarter of a second.
- **Turbo is 20ms faster and much worse.** "582" became "$5.82"; "60 rupees for metro scooter parking" became "16 rupees for petrol scooter parking".
- **Hinting the transcriber with the user's own words made it worse.** It pulled speech toward the hints ("shopping" became "clubbing") and damaged amounts ("582" became "6,582", "50,000" became "50 dinner"). Not shipped. The hint list survives only in `scripts/replay-vocab.ts`, so the experiment can be repeated against another model.
- **No setup recovered the takes that were misheard the first time.** Of 20 takes that were retried, each setup got 2 or 3. Better transcription is not available by configuration.

Every setup still rejected all 19 silent takes.

### Extraction: nothing changed

About 80% of an extraction is the model reasoning before it writes (roughly 500 to 700 tokens of a 600 to 900 token reply), so `reasoning_effort: "low"` was the obvious lever, and it cut generation to about a third.

It was tried on 40 real transcripts against what production had returned for them. 32 matched. The 8 that did not included real losses:

- "45 print out" returned no expense at all
- a four-expense entry spread over three days lost every date
- "40, no, 20, no, 30 rupees for lunch. No, 25" was recorded as two expenses
- "50 for shopping" lost its description

Not shipped. `openai/gpt-oss-20b` was also tried and dropped descriptions on the simplest inputs ("200 petrol").

### So the speed came from structure

| Change | Why |
|---|---|
| One round trip, not two | `/api/transcribe` now runs extraction itself. The phone used to carry the transcript back up to `/api/extract` |
| Logging moved off the reply path | Stage results and the audio upload run in `after()`. The capture row is inserted alongside the call to the transcriber, so it costs no waiting and still exists before the client reports against it |
| The reply is streamed | What was heard goes back the moment the transcriber answers; the transactions follow on the same response |
| Every stage is timed | `asr_ms`, `extract_ms`, and `total_ms` (tap-to-result as the device measured it). Migration `005_timings.sql` |

Measured locally with a stored recording standing in for the microphone: the heard text appeared 0.64s after stopping, and the expense was logged at 2.5s. Production numbers will be in `total_ms` from the first capture after deploy.

### Accuracy came from recovery, not recognition

Since no model setting made recognition better, the changes are about what a mishear costs.

| Change | Before | After |
|---|---|---|
| Tap to fix | Undo, then say it all again | Each entry in the "Logged" confirmation opens straight into its edit form |
| Words kept when the number is lost | An error, and another take | The transcript is put in the text box to correct |
| Words kept when extraction fails | An error, and another take | Same |
| Typed text that fails | Cleared | Left in the box |
| Heard text shown early | Only in the small debug line, afterwards | Shown as soon as it exists, which is also the earliest a mishear can be seen |

### Opening on capture

The manifest already had `start_url: "/app"`, but a home-screen icon made before the manifest existed stays pinned to the page it was made from. `OpenOnCapture`, an inline script in the root layout, sends a cold open of `/journal` to `/app` before anything paints. A reload, back/forward, and the in-app link all stay on the journal. This supersedes the "remove and reinstall" caveat in `PWA-INSTALL.md` §4.

### The calendar

Always open at the top of the journal, with each day's total under its date (`450`, `1.5k`, `1.5L`) and the month's total in its header. This reverses the "no amounts" rule in §18 of the journal context doc, on the evidence that the question actually asked of the journal is what a given day cost.

## 4. Bugs found on the way

| Bug | Effect |
|---|---|
| "Today" was computed in UTC on the client | A capture between midnight and 5:30am IST was dated to the previous day, so it was missing from the capture screen's list for today |
| `timeDisplay` compared a local date with a UTC one | An entry logged just after midnight read as backdated |
| Typed captures were stored with `source: "voice"` | Every transaction claimed to be spoken |
| Typed text was cleared when extraction failed | A rate-limit error meant retyping |
| The detail sheet's back button said "Journal" on the capture screen | Wrong destination named |

## 5. Still open

- **Recognition itself.** The takes that were misheard stay misheard under every setup tried. A different speech provider is the untested option.
- **The rate limit.** The free tier allows 8,000 tokens a minute, and one extraction is about 1,500. Five or six quick entries in a minute will hit it.
- **The microphone warm-up.** It averages 0.6s and runs to its 1.2s ceiling in a quiet room. Changing it needs a real handset; nothing here touched `useRecorder`.
- **The server copy can fall behind.** Two typed captures were extracted correctly on the server and have no transaction in the mirror. The reports are fire-and-forget, so whether the phone lost the reply or only the report cannot be told from the record.
- **Six lint errors predate this work** (`react-hooks/set-state-in-effect`). The count is unchanged.

# Small models and faster transaction capture

## Decision

Keep Whisper large-v3 and GPT-OSS-120B for general capture. Do not bundle an
SLM into the Android app: the local candidate failed the accuracy gate and
was slower on the test host. Use a small, closed-grammar parser before cloud
extraction for explicit numeric amounts with ten known expense labels.
Corrections, dates, people, payment overrides, multiple expenses, approximate
amounts, and unfamiliar phrases continue through the existing model.

The parser runs in the shared server extraction function, so web and widget
both benefit without an APK update. It does not make recording offline.
Audio confidence and review-all settings still control saving on both clients.

## Research

- [Qwen3-0.6B model card](https://huggingface.co/Qwen/Qwen3-0.6B): a text
  generation model, not a speech recognizer. Replacing extraction alone cannot
  repair words already misheard by ASR.
- [Ollama Qwen3 package](https://ollama.com/library/qwen3:0.6b): the Q4_K_M
  package is approximately 523 MB. Installed for evaluation on the development
  computer, not distributed with the app.
- [LiteRT-LM Android](https://developers.google.com/edge/litert-lm/android)
  provides a native Kotlin inference integration. This project currently uses
  a web app plus a native recording widget; native-only inference would not
  cover Chrome-installed use. Hardware performance still needs handset tests.
- [Groq speech documentation](https://console.groq.com/docs/speech-to-text)
  recommends large-v3 for error-sensitive multilingual use. The project's
  earlier replay also found Turbo damaged amounts (see SPEED-ACCURACY.md).

## Measurements

16 synthetic, explicitly labelled extraction cases: common expenses, English
and Hindi amounts, corrections, multiple expenses, people, payment/date
overrides, and non-expenses. One request per case/model, same full production
prompt, no journal writes. These are a screening set, not a production accuracy
estimate. Checks cover count, amount and case-specific description/date/payment/
review requirements, not every field. Milliseconds include request wall time.

| Candidate | Passing cases | Median | p95 | Decision |
|---|---:|---:|---:|---|
| GPT-OSS-120B baseline | 16/16 | 1,673 | 5,012 | Retain |
| GPT-OSS-20B | 14/16 | 1,262 | 2,618 | Reject: missing petrol description; invalid JSON on correction |
| Qwen3-0.6B Q4_K_M, local CPU | 10/16 | 7,921 | 16,223 | Reject: Hindi amount/correction and other failures |

The local model used official llama.cpp Windows CPU release b12387, four
threads, 4096 context, reasoning disabled, JSON output, max 700 generated tokens.
Ollama downloaded the model but its installed runtime lacked llama-server;
the portable runtime resolved that infrastructure failure. No failed setup
requests are included in the final Qwen measurements. The attempted hosted
Llama 8B was unavailable to this key and is excluded from model comparisons.
Desktop CPU latency is not Android latency.

The exact parser measured median 0.0039 ms and p95 0.0081 ms over 1,000 local
calls. This replaces only extraction for supported phrases; it excludes ASR,
network, rendering and correction time. It matched 8/120 existing synthetic
corpus entries with no differences in compared amount/count/description/date/
payment/review fields among baseline-correct entries. No broad end-to-end speed
or recognition accuracy percentage is claimed.

## Recognition fix

The pre-extraction presence filter omitted English thirteen through nineteen,
Unicode digits, and Hindi number words. Those could be discarded before the
model ever saw them. Expanded the filter; it does not guess an amount or weaken
the no-speech/confidence gates. Hindi support remains incomplete, particularly
for compound number words; English remains the ASR language default.

Eight synthetic Windows TTS clips were each transcribed with English and auto
language settings. Both produced identical transcripts, including one
"no wait" -> "no way" error. Both rejected the two non-expenses. This does not
establish Hindi acoustic quality, accent robustness, noise performance or
Nothing Phone latency, so auto language was not shipped as the default.

## Reproduction and verification

- `scripts/model-eval.ts cloud`: models from EVAL_MODELS or the two GPT-OSS sizes;
  requires GROQ_API_KEY. Direct model calls only, paced 11 seconds apart.
- `scripts/model-eval.ts local`: OpenAI-compatible llama.cpp on localhost:11435.
- `qa/make-synthetic-speech.ps1` then `scripts/speech-eval.ts`: synthetic ASR test.
- `scripts/capture-pipeline.test.ts`: 520 checks, no network; all passed.
- `scripts/quick-eval.ts`: compatibility check using the existing local synthetic
  baseline at `.captures/eval/baseline.json`, plus parser timing.
- Raw evaluation logs and outputs are in ignored `qa/shots/verification/`.

Final verification:

- Production Next webpack build and TypeScript passed.
- Targeted lint passed. Full lint initially found an explicit-any in the new
  evaluation harness; fixed and rechecked. Four old journal-test warnings remain.
- Real local API -> parser -> Chrome save -> reload persistence passed, with
  production database/storage credentials disabled.
- Browser typed/review/undo/journal regressions: 13/13 tests, 62 checks.
- Browser voice/recovery/permission/review regressions: 14/14 tests, 69 checks.
- Android 14 emulator, existing QA APK: real recorded upload -> real Next route
  -> deterministic ASR fixture -> parser -> widget saved state: 17 checks passed.
  Initial attempts exposed test-device sleep and a delayed idle refresh; the
  harness now wakes the device and checks lifecycle order from WARMING onward.
  Server extraction logged 0–1 ms. ASR was mocked in this integration test;
  these numbers are not a real speech-to-save benchmark.
- Native application code did not change. Existing production APK 1.2.2 is
  compatible; no model download or reinstall is required on the phone.

Nothing Phone (2) / Android 16 testing remains unverified by the user's choice
to use the emulator only. Vercel deployment inspection returned a team-scope
403; a main push alone does not prove the new version is live.

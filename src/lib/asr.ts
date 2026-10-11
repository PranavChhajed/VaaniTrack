import { hasAmount } from "./amounts";
import type { AsrVerdict } from "./observe";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export const ASR_MODEL = process.env.GROQ_ASR_MODEL ?? "whisper-large-v3";

/**
 * Stage 1: audio → text.
 *
 * whisper-large-v3 is chosen deliberately: it is the model that scores
 * single-digit WER on the Svarah Indian-accent benchmark, and Indian-accented
 * English is a v1 requirement (PRD §8.3).
 *
 * Lives here rather than in the route so the replay harness
 * (scripts/replay.ts) runs stored recordings through exactly the code the app
 * runs, guards included. A model or prompt change is only evidence if it was
 * measured against the same rejection rules that will ship with it.
 *
 * Two guards here exist because of Principle 0: never record a wrong
 * transaction:
 *
 * 1. The decoder prompt is vocabulary only, never example sentences. Given
 *    low-signal audio Whisper will happily emit its prompt back as if it were
 *    speech. A prompt containing "I spent 700 on groceries, paid in cash"
 *    turned 1.2 seconds of a sine wave into exactly that transaction, which is
 *    the worst failure this product can have.
 * 2. verbose_json gives per-segment no_speech_prob and avg_logprob. Audio the
 *    model itself doubts is rejected rather than passed downstream, where the
 *    extraction stage would dutifully turn noise into a number.
 */

/**
 * Decoder prompt, chosen by experiment rather than intuition.
 *
 * Transcribing the same recording of "two fifty lunch" three ways:
 *
 *   no prompt                     -> " 2.50 lunch."
 *   vocabulary words only         -> " $2.50 lunch"     (worse)
 *   rupee-formatted amounts       -> " 250 lunch."      (correct)
 *
 * Showing the model what an Indian amount looks like is what stops it
 * formatting spoken "two fifty" as a decimal currency value. The digits here
 * were a hallucination risk worth re-testing: on silence this prompt yields
 * "Subtitles by the Amara.org community", not a fabricated amount, and that
 * phrase is already on the denylist below.
 */
const DECODER_PROMPT = "Amounts in Indian rupees: 250, 120, 1500, 300.";

/** The start of DECODER_PROMPT as normalise() leaves it. A transcript that
 *  contains this is the prompt read back, not anything that was said. */
const PROMPT_ECHO = "amounts in indian rupees";

/**
 * The decoder prompt, optionally with a list of the speaker's own words.
 *
 * The app never passes any. Hinting the transcriber with words from the
 * user's journal was tried against 103 real recordings and lost: it pulled
 * what was said toward what was hinted ("shopping" became "clubbing") and
 * damaged amounts ("582" became "6,582", "50,000" became "50 dinner"). The
 * parameter stays for scripts/replay.ts, so the experiment can be repeated
 * against a different model. docs/design/SPEED-ACCURACY.md has the numbers.
 */
export function decoderPrompt(vocab: string[]): string {
  return vocab.length > 0
    ? `${DECODER_PROMPT} ${vocab.join(", ")}.`
    : DECODER_PROMPT;
}

/** Segments the model doubts this much are treated as silence. */
const NO_SPEECH_PROB_MAX = 0.6;
const AVG_LOGPROB_MIN = -1.0;

/**
 * Whisper's stock hallucinations.
 *
 * Given quiet, clipped or unclear audio the model does not return nothing; it
 * returns one of a small set of confident-looking stock phrases, often with a
 * perfectly healthy no_speech_prob. Observed on a real device: three seconds of
 * someone saying "two fifty lunch" came back as "Hello, how are you?".
 *
 * These are matched exactly (after normalising) rather than by substring, so a
 * genuine "250 for a thank you gift" is untouched.
 *
 * Both sides of the comparison go through normalise(). Writing the entries in
 * their natural punctuated form and comparing them raw meant every entry
 * containing a "." or "?" was dead code: "Subtitles by the Amara.org community"
 * normalises to "...amaraorg..." and never matched its own denylist entry. It
 * was still rejected, but only by the no-amount backstop -- which would not
 * have saved us from a stock phrase that happened to contain a digit.
 */
const HALLUCINATIONS = new Set([
  "hello how are you",
  "hello how are you?",
  "thank you",
  "thank you.",
  "thanks for watching",
  "thank you for watching",
  "thanks for watching!",
  "please subscribe",
  "you",
  "bye",
  "bye.",
  "okay",
  "so",
  "i'm sorry",
  "subtitles by the amara.org community",
  "transcription by castingwords",
].map(normalise));

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * No amount anywhere means no expense. The check is `hasAmount` (amounts.ts),
 * which knows the whole number vocabulary: this used to be a list of words that
 * stopped at "twelve", so "chai was fifteen rupees" was rejected as having no
 * number in it.
 */
const hasNumber = hasAmount;

export type Segment = {
  no_speech_prob?: number;
  avg_logprob?: number;
  text?: string;
};

export function extensionFor(type: string): string {
  if (type.includes("mp4") || type.includes("m4a")) return "m4a";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  return "webm";
}

export type AsrRejection = "stock-phrase" | "no-amount" | "no-speech";

type Heard = {
  model: string;
  text: string;
  segments: Segment[];
  /** Mean avg_logprob across segments. Negative by nature: about -0.27 for a
   *  clean capture, against a gate threshold of -0.9. Null with no segments. */
  avgLogprob: number | null;
  /** The worst segment's no_speech_prob. */
  noSpeechProb: number;
  /** Wall time of the upstream call. */
  ms: number;
};

export type AsrResult =
  | (Heard & { kind: "accepted" })
  | (Heard & { kind: "rejected"; verdict: AsrVerdict; reason: AsrRejection })
  | { kind: "error"; status: 429 | 502; error: string; detail: string; ms: number };

export async function transcribeAudio(
  bytes: ArrayBuffer,
  mime: string,
  opts: { apiKey: string; vocab?: string[]; model?: string },
): Promise<AsrResult> {
  const model = opts.model ?? ASR_MODEL;
  const upstream = new FormData();
  upstream.append(
    "file",
    new Blob([bytes], { type: mime || "application/octet-stream" }),
    `capture.${extensionFor(mime)}`,
  );
  upstream.append("model", model);
  upstream.append("language", "en");
  upstream.append("response_format", "verbose_json");
  upstream.append("temperature", "0");
  upstream.append("prompt", decoderPrompt(opts.vocab ?? []));

  const started = Date.now();
  let data: { text?: string; segments?: Segment[] };
  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      body: upstream,
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      const ms = Date.now() - started;
      return response.status === 429
        ? {
            kind: "error",
            status: 429,
            error: "Hit the API rate limit. Wait a few seconds and try again.",
            detail,
            ms,
          }
        : {
            kind: "error",
            status: 502,
            error: `Transcription failed (${response.status})`,
            detail,
            ms,
          };
    }
    data = (await response.json()) as typeof data;
  } catch (error) {
    return {
      kind: "error",
      status: 502,
      error: "Could not reach the transcription service.",
      detail: String(error),
      ms: Date.now() - started,
    };
  }

  const text = (data.text ?? "").trim();
  const segments = data.segments ?? [];
  const heard: Heard = {
    model,
    text,
    segments,
    avgLogprob: segments.length
      ? segments.reduce((sum, s) => sum + (s.avg_logprob ?? 0), 0) / segments.length
      : null,
    noSpeechProb: segments.length
      ? Math.max(...segments.map((s) => s.no_speech_prob ?? 0))
      : 0,
    ms: Date.now() - started,
  };

  // Reject audio the model itself doesn't believe contains speech, rather
  // than letting the extraction stage invent a transaction from noise.
  const speechy = segments.filter(
    (s) =>
      (s.no_speech_prob ?? 0) <= NO_SPEECH_PROB_MAX &&
      (s.avg_logprob ?? 0) >= AVG_LOGPROB_MIN,
  );
  const said = normalise(text);
  const stock = HALLUCINATIONS.has(said) || said.includes(PROMPT_ECHO);
  const noNumber = text.length > 0 && !hasNumber(text);

  if (stock) {
    return { ...heard, kind: "rejected", verdict: "rejected_denylist", reason: "stock-phrase" };
  }
  if (noNumber) {
    return { ...heard, kind: "rejected", verdict: "rejected_no_amount", reason: "no-amount" };
  }
  if (!text || (segments.length > 0 && speechy.length === 0)) {
    return { ...heard, kind: "rejected", verdict: "rejected_no_speech", reason: "no-speech" };
  }
  return { ...heard, kind: "accepted" };
}

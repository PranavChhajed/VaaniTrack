import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  recordCapture,
  recordAudioDecision,
  storeAudio,
  validDeviceId,
  type AsrVerdict,
} from "@/lib/observe";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export const runtime = "nodejs"; // node:fs and `postgres` both require it
export const maxDuration = 30;

/**
 * Keep a copy of every capture, with what came back for it.
 *
 * Tuning transcription against synthesised speech is tuning against the wrong
 * distribution: a text-to-speech "two fifty lunch" is clean, evenly paced and
 * accent-free, which is exactly what the real failures are not. Real captures
 * from a real phone in a real room are the only corpus that can answer whether
 * a prompt, model or threshold change actually helps, and once saved they can
 * be replayed offline as many times as needed, with no device in the loop.
 *
 * Local disk only, dev-only, opt-in via SAVE_CAPTURES=1. Structurally off in
 * production regardless of that flag: Vercel's filesystem is read-only, so
 * this used to fail silently into the catch{} below on every request there.
 * Off by default locally too now, so a forgotten env var can't retain audio.
 */
const SAVE_CAPTURES =
  process.env.NODE_ENV !== "production" && process.env.SAVE_CAPTURES === "1";
const CAPTURE_DIR = join(process.cwd(), ".captures");

async function keepCapture(
  audio: File,
  bytes: ArrayBuffer,
  outcome: Record<string, unknown>,
): Promise<void> {
  if (!SAVE_CAPTURES) return;
  try {
    await mkdir(CAPTURE_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = join(CAPTURE_DIR, stamp);
    await writeFile(`${base}.${extensionFor(audio.type || "")}`, Buffer.from(bytes));
    await writeFile(
      `${base}.json`,
      JSON.stringify({ at: stamp, type: audio.type, bytes: audio.size, ...outcome }, null, 2),
    );
  } catch {
    // Diagnostics must never take down the capture path.
  }
}

/**
 * Stage 1: audio → text.
 *
 * whisper-large-v3 is chosen deliberately: it is the model that scores
 * single-digit WER on the Svarah Indian-accent benchmark, and Indian-accented
 * English is a v1 requirement (PRD §8.3).
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

/** No digits anywhere means no amount, which means no expense. */
function hasNumber(text: string): boolean {
  return /\d/.test(text) || /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|crore|k)\b/i.test(text);
}

type Segment = {
  no_speech_prob?: number;
  avg_logprob?: number;
  text?: string;
};

function extensionFor(type: string): string {
  if (type.includes("mp4") || type.includes("m4a")) return "m4a";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  return "webm";
}

/**
 * Mean avg_logprob across segments, the same figure the accepted path
 * reports as "confidence". Negative by nature: about -0.27 for a clean
 * capture, against a gate threshold of -0.9.
 */
function meanLogprob(segments: Segment[]): number | null {
  if (segments.length === 0) return null;
  const sum = segments.reduce((acc, s) => acc + (s.avg_logprob ?? 0), 0);
  return Number((sum / segments.length).toFixed(4));
}

/**
 * A signal level sent by the client, in dBFS.
 *
 * Rejects anything that is not a finite negative number below full scale. The
 * client computes these from live audio, so -Infinity is an ordinary outcome
 * for a stream that never carried a sample, and it must not be stored as if it
 * were a measurement.
 */
function finiteDb(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const n = Number(value);
  return Number.isFinite(n) && n <= 0 && n > -200 ? Number(n.toFixed(2)) : null;
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not set. Add it to .env.local." },
      { status: 500 },
    );
  }

  let audio: File | null = null;
  let deviceId: string | null = null;
  let consent = false;
  let audioMs: number | null = null;
  let audioPeakDb: number | null = null;
  let audioMeanDb: number | null = null;
  let audioWarmupMs: number | null = null;
  try {
    const form = await request.formData();
    const value = form.get("audio");
    if (value instanceof File) audio = value;
    deviceId = validDeviceId(form.get("deviceId"));
    // Consent is a claim the client makes about what its user agreed to. It
    // can only ever reduce what is kept, never unlock anything else, so
    // trusting it costs nothing.
    consent = form.get("audioConsent") === "granted";
    const ms = Number(form.get("audioMs"));
    audioMs = Number.isFinite(ms) && ms > 0 ? Math.round(ms) : null;
    // Measured by the browser's level meter, in dBFS, so negative. Absent on
    // older clients and whenever the meter could not start, which is why every
    // use of it below tolerates null rather than reading it as silence.
    audioPeakDb = finiteDb(form.get("peakDb"));
    audioMeanDb = finiteDb(form.get("meanDb"));
    const warm = Number(form.get("warmupMs"));
    audioWarmupMs =
      Number.isFinite(warm) && warm >= 0 && warm < 60000 ? Math.round(warm) : null;
  } catch {
    return NextResponse.json(
      { error: "Could not read the uploaded audio." },
      { status: 400 },
    );
  }

  if (!audio || audio.size === 0) {
    return NextResponse.json({ error: "No audio received." }, { status: 400 });
  }

  // Too little data can mean two different things, and they need different
  // messages. A brief tap and a normal-length recording of near-silence both
  // land under 2000 bytes, but only one of them is fixed by "hold it longer";
  // telling someone whose mic is muted to record for longer just gets the
  // identical message on every retry, which is indistinguishable from the app
  // being broken.
  if (audio.size < 2000) {
    const briefTap = (audioMs ?? 0) < 1200;
    const reason = briefTap ? "brief tap" : "near-silent despite normal duration";
    await recordCapture({
      deviceId,
      source: "voice",
      audioMime: audio.type || null,
      audioBytes: audio.size,
      audioMs,
      audioPeakDb,
      audioMeanDb,
      audioWarmupMs,
      asrVerdict: "rejected_too_small",
      asrReason: reason,
    });
    return NextResponse.json(
      {
        error: briefTap
          ? "That recording was too short. Hold on a moment before tapping again."
          : "That recording didn't pick up any sound, even though it ran for a few seconds. Check that this tab has microphone access and that your mic isn't muted or covered, then try again closer to it.",
        debug: { bytes: audio.size, ms: audioMs, type: audio.type, reason },
      },
      { status: 422 },
    );
  }

  // Read once: the same bytes go upstream and to disk, so what gets replayed
  // later is byte-identical to what Whisper actually heard.
  const bytes = await audio.arrayBuffer();

  const upstream = new FormData();
  const filename = `capture.${extensionFor(audio.type || "")}`;
  upstream.append(
    "file",
    new Blob([bytes], { type: audio.type || "application/octet-stream" }),
    filename,
  );
  upstream.append("model", "whisper-large-v3");
  upstream.append("language", "en");
  upstream.append("response_format", "verbose_json");
  upstream.append("temperature", "0");
  upstream.append("prompt", DECODER_PROMPT);

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      if (response.status === 429) {
        return NextResponse.json(
          { error: "Hit the API rate limit. Wait a few seconds and try again.", detail },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { error: `Transcription failed (${response.status})`, detail },
        { status: 502 },
      );
    }

    const data = (await response.json()) as {
      text?: string;
      segments?: Segment[];
    };
    const text = (data.text ?? "").trim();
    const segments = data.segments ?? [];

    // Reject audio the model itself doesn't believe contains speech, rather
    // than letting the extraction stage invent a transaction from noise.
    const speechy = segments.filter(
      (s) =>
        (s.no_speech_prob ?? 0) <= NO_SPEECH_PROB_MAX &&
        (s.avg_logprob ?? 0) >= AVG_LOGPROB_MIN,
    );
    const worstNoSpeech = segments.length
      ? Math.max(...segments.map((s) => s.no_speech_prob ?? 0))
      : 0;

    const stock = HALLUCINATIONS.has(normalise(text));
    const noNumber = text.length > 0 && !hasNumber(text);

    if (
      !text ||
      (segments.length > 0 && speechy.length === 0) ||
      stock ||
      noNumber
    ) {
      console.log(
        `[transcribe] REJECTED ${audio.size}B -> "${text}" ` +
          `(stock=${stock} noNumber=${noNumber} noSpeech=${worstNoSpeech.toFixed(2)})`,
      );
      const reason = stock ? "stock-phrase" : noNumber ? "no-amount" : "no-speech";
      await keepCapture(audio, bytes, {
        verdict: "rejected",
        heard: text,
        reason,
        noSpeechProb: Number(worstNoSpeech.toFixed(3)),
        segments,
      });
      // Rejections are the most informative rows in the table: they mark
      // exactly where the trust boundary sits, and they are invisible in a
      // record that only keeps successful transactions.
      const verdict: AsrVerdict = stock
        ? "rejected_denylist"
        : noNumber
          ? "rejected_no_amount"
          : "rejected_no_speech";
      const rejectedId = await recordCapture({
        deviceId,
        source: "voice",
        audioMime: audio.type || null,
        audioBytes: audio.size,
        audioMs,
        audioPeakDb,
        audioMeanDb,
        audioWarmupMs,
        asrModel: "whisper-large-v3",
        transcript: text || null,
        asrVerdict: verdict,
        asrReason: reason,
        avgLogprob: meanLogprob(segments),
        noSpeechProb: Number(worstNoSpeech.toFixed(3)),
      });
      if (rejectedId) {
        const path = consent
          ? await storeAudio(rejectedId, bytes, audio.type || "audio/webm")
          : null;
        await recordAudioDecision(rejectedId, { consent, path });
      }
      return NextResponse.json(
        {
          error: stock
            ? "That didn’t come through clearly. Try again, closer to the mic."
            : noNumber
              ? `Heard “${text}”, but no amount in it. Say the number too, like “250 lunch”.`
              : "Didn’t catch any speech there. Try again, a bit closer to the mic.",
          debug: {
            bytes: audio.size,
            type: audio.type,
            heard: text || null,
            reason: stock ? "stock-phrase" : noNumber ? "no-amount" : "no-speech",
            noSpeechProb: Number(worstNoSpeech.toFixed(2)),
          },
        },
        { status: 422 },
      );
    }

    // How sure the model is of the words themselves. Passed downstream so a
    // shaky transcript earns a review instead of being logged silently;
    // "Hello, hi, so I want 50 rupees for lunch now" is a real observed
    // transcript of a clean recording, and auto-logging that would put a wrong
    // amount in the ledger without ever showing it to anyone.
    const confidence = segments.length
      ? segments.reduce((sum, s) => sum + (s.avg_logprob ?? 0), 0) / segments.length
      : 0;

    console.log(
      `[transcribe] ${audio.size}B ${audio.type || "?"} -> "${text}" ` +
        `(noSpeech ${worstNoSpeech.toFixed(2)} conf ${confidence.toFixed(2)})`,
    );
    await keepCapture(audio, bytes, {
      verdict: "accepted",
      heard: text,
      confidence: Number(confidence.toFixed(3)),
      noSpeechProb: Number(worstNoSpeech.toFixed(3)),
      segments,
    });

    // The capture id threads through to extraction, so the transcript and what
    // the extractor made of it end up on the same row and can be blamed
    // separately when the final transaction is wrong.
    const captureId = await recordCapture({
      deviceId,
      source: "voice",
      audioMime: audio.type || null,
      audioBytes: audio.size,
      audioMs,
      audioPeakDb,
      audioMeanDb,
      audioWarmupMs,
      asrModel: "whisper-large-v3",
      transcript: text,
      asrVerdict: "accepted",
      avgLogprob: Number(confidence.toFixed(4)),
      noSpeechProb: Number(worstNoSpeech.toFixed(4)),
    });
    if (captureId) {
      const path = consent
        ? await storeAudio(captureId, bytes, audio.type || "audio/webm")
        : null;
      await recordAudioDecision(captureId, { consent, path });
    }

    return NextResponse.json({
      text,
      confidence,
      captureId,
      debug: {
        bytes: audio.size,
        type: audio.type,
        sentAs: filename,
        noSpeechProb: Number(worstNoSpeech.toFixed(2)),
        confidence: Number(confidence.toFixed(2)),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Could not reach the transcription service.", detail: String(error) },
      { status: 502 },
    );
  }
}

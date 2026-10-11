import { after, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extensionFor, transcribeAudio } from "@/lib/asr";
import { cleanPayment, extractTransactions } from "@/lib/extract";
import { PIPELINE, runExtraction } from "@/lib/pipeline";
import {
  recordCapture,
  recordAudioDecision,
  recordExtraction,
  storeAudio,
  updateCapture,
  validDeviceId,
} from "@/lib/observe";

export const runtime = "nodejs"; // node:fs and `postgres` both require it
export const maxDuration = 30;

/**
 * A spoken capture, start to finish: audio → text → transaction(s).
 *
 * Both stages run here, in one request. They used to be two, with the phone
 * carrying the transcript back up to a second route, and every write to the
 * observability tables sat in the reply path of each. A month of real use
 * called the result slow, so:
 *
 *   - the phone makes one round trip, not two;
 *   - the reply is streamed: what was heard goes back the moment the
 *     transcriber answers, and the transactions follow on the same response;
 *   - the capture row is opened alongside the call to the transcriber, not
 *     after it, so it costs no waiting;
 *   - everything else that is only record-keeping (stage results, the audio
 *     upload) runs in `after()`, once the reply is already on its way.
 *
 * The rule from lib/observe.ts still governs all of it: diagnostics must never
 * take down the capture path.
 */

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

/** Answered at once and does nothing: the app sends it as recording starts, so a function that
 *  has been idle is awake by the time the audio arrives (lib/warm.ts). */
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
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
  let today = new Date().toISOString().slice(0, 10);
  let defaultPayment = cleanPayment(undefined);
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
    // The speaker's own calendar date. The server's is UTC, which is still
    // yesterday for the first five and a half hours of an Indian morning.
    const day = form.get("today");
    if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) today = day;
    defaultPayment = cleanPayment(form.get("defaultPayment"));
  } catch {
    return NextResponse.json(
      { error: "Could not read the uploaded audio." },
      { status: 400 },
    );
  }

  if (!audio || audio.size === 0) {
    return NextResponse.json({ error: "No audio received." }, { status: 400 });
  }

  const measured = {
    deviceId,
    source: "voice" as const,
    audioMime: audio.type || null,
    audioBytes: audio.size,
    audioMs,
    audioPeakDb,
    audioMeanDb,
    audioWarmupMs,
  };

  // Too little data can mean two different things, and they need different
  // messages. A brief tap and a normal-length recording of near-silence both
  // land under 2000 bytes, but only one of them is fixed by "hold it longer";
  // telling someone whose mic is muted to record for longer just gets the
  // identical message on every retry, which is indistinguishable from the app
  // being broken.
  if (audio.size < 2000) {
    const briefTap = (audioMs ?? 0) < 1200;
    const reason = briefTap ? "brief tap" : "near-silent despite normal duration";
    after(() =>
      recordCapture({
        ...measured,
        asrVerdict: "rejected_too_small",
        asrReason: reason,
      }),
    );
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

  // Read once: the same bytes go upstream and to storage, so what gets
  // replayed later is byte-identical to what Whisper actually heard.
  const bytes = await audio.arrayBuffer();
  const mime = audio.type || "audio/webm";
  const file = audio;

  // Opened now, deliberately not awaited: the insert runs while the
  // transcriber does, and is long finished by the time anything needs its id.
  const opened = recordCapture({ ...measured, id: crypto.randomUUID() });

  /** The audio's fate, written after the reply. Consent decides it, and the
   *  decision is recorded either way. */
  const settleAudio = async (captureId: string) => {
    const path = consent ? await storeAudio(captureId, bytes, mime) : null;
    await recordAudioDecision(captureId, { consent, path });
  };

  const asr = await transcribeAudio(bytes, mime, { apiKey });

  if (asr.kind === "error") {
    after(async () => {
      const captureId = await opened;
      if (!captureId) return;
      await updateCapture(captureId, {
        asrModel: null,
        asrVerdict: "error",
        asrReason: asr.error,
        asrMs: asr.ms,
      });
    });
    return NextResponse.json(
      { error: asr.error, detail: asr.detail },
      { status: asr.status },
    );
  }

  const stageOne = {
    asrModel: asr.model,
    transcript: asr.text || null,
    avgLogprob: asr.avgLogprob === null ? null : Number(asr.avgLogprob.toFixed(4)),
    noSpeechProb: Number(asr.noSpeechProb.toFixed(4)),
    asrMs: asr.ms,
  };

  if (asr.kind === "rejected") {
    console.log(
      `[transcribe] REJECTED ${file.size}B -> "${asr.text}" ` +
        `(${asr.reason} noSpeech=${asr.noSpeechProb.toFixed(2)} ${asr.ms}ms)`,
    );
    // Rejections are the most informative rows in the table: they mark
    // exactly where the trust boundary sits, and they are invisible in a
    // record that only keeps successful transactions.
    after(async () => {
      await keepCapture(file, bytes, {
        verdict: "rejected",
        heard: asr.text,
        reason: asr.reason,
        noSpeechProb: Number(asr.noSpeechProb.toFixed(3)),
        segments: asr.segments,
      });
      const captureId = await opened;
      if (!captureId) return;
      await updateCapture(captureId, {
        ...stageOne,
        asrVerdict: asr.verdict,
        asrReason: asr.reason,
      });
      await settleAudio(captureId);
    });
    return NextResponse.json(
      {
        error:
          asr.reason === "stock-phrase"
            ? "That didn’t come through clearly. Try again, closer to the mic."
            : asr.reason === "no-amount"
              ? `Heard “${asr.text}”, but no amount in it. Say the number too, like “250 lunch”.`
              : "Didn’t catch any speech there. Try again, a bit closer to the mic.",
        // What was heard, when it is worth correcting by hand: real words
        // with the number lost. The client offers it back in the text box, so
        // a mishear costs one edit rather than another take.
        heard: asr.reason === "no-amount" ? asr.text : null,
        debug: {
          bytes: file.size,
          type: file.type,
          heard: asr.text || null,
          reason: asr.reason,
          noSpeechProb: Number(asr.noSpeechProb.toFixed(2)),
        },
      },
      { status: 422 },
    );
  }

  // How sure the model is of the words themselves. Passed back so a shaky
  // transcript earns a review instead of being logged silently; "Hello, hi,
  // so I want 50 rupees for lunch now" is a real observed transcript of a
  // clean recording, and auto-logging that would put a wrong amount in the
  // ledger without ever showing it to anyone.
  const confidence = asr.avgLogprob ?? 0;

  // Started, not awaited: the reply below begins with what was heard and
  // finishes with what was made of it, so the speaker sees their own words
  // while the slower half is still running.
  // The plain sentences are answered by code and the rest by the fast model, with the
  // careful one behind it (lib/pipeline.ts). VOICE_PIPELINE=v1 is the old single-model route.
  const extracting =
    PIPELINE === "v1"
      ? extractTransactions(asr.text, today, { apiKey, defaultPayment })
      : runExtraction(asr.text, today, { apiKey, defaultPayment });

  // Registered here, while the request is still being handled, and left to
  // wait on the extraction itself. It runs once the reply has been sent.
  after(async () => {
    const extraction = await extracting;
    console.log(
      `[transcribe] ${file.size}B ${file.type || "?"} -> "${asr.text}" ` +
        `(conf ${confidence.toFixed(2)} asr ${asr.ms}ms extract ${extraction.ms}ms` +
        (extraction.kind === "ok" ? ` ${extraction.transactions.length} txn)` : ` ${extraction.kind})`),
    );
    await keepCapture(file, bytes, {
      verdict: "accepted",
      heard: asr.text,
      confidence: Number(confidence.toFixed(3)),
      noSpeechProb: Number(asr.noSpeechProb.toFixed(3)),
      segments: asr.segments,
    });
    const captureId = await opened;
    if (!captureId) return;
    await updateCapture(captureId, { ...stageOne, asrVerdict: "accepted" });
    await recordExtraction(captureId, {
      model: extraction.model,
      raw: extraction.kind === "ok" ? extraction.raw
        : extraction.kind === "malformed" ? { content: extraction.content }
        : { error: extraction.error, detail: extraction.detail },
      error: extraction.kind === "ok" ? null
        : extraction.kind === "malformed" ? "malformed JSON"
        : extraction.error,
      ms: extraction.ms,
    });
    await settleAudio(captureId);
  });

  // Two lines of JSON, a second or two apart. A client that does not read
  // the stream as it arrives loses nothing but the early look: the last line
  // is the whole answer on its own.
  const encoder = new TextEncoder();
  const line = (value: unknown) => encoder.encode(`${JSON.stringify(value)}\n`);

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(line({ heard: asr.text, confidence }));

      const extraction = await extracting;
      // The capture id threads back to the client, which reports the gate's
      // verdict and the user's actions against it, so the transcript, what
      // the extractor made of it and what the user did about it end up on one
      // row and can be blamed separately when the final transaction is wrong.
      const captureId = await opened;

      const result = {
        text: asr.text,
        confidence,
        captureId,
        debug: {
          bytes: file.size,
          type: file.type,
          noSpeechProb: Number(asr.noSpeechProb.toFixed(2)),
          confidence: Number(confidence.toFixed(2)),
          asrMs: asr.ms,
          extractMs: extraction.ms,
          route: "route" in extraction ? extraction.route : "v1",
        },
      };
      controller.enqueue(
        line(
          extraction.kind === "ok"
            ? { ...result, transactions: extraction.transactions }
            : // The words were heard even if nothing could be made of them.
              // Saying so, with the transcript, lets the client keep what was
              // said and offer it back as text instead of asking for the
              // recording again.
              {
                ...result,
                extractError:
                  extraction.kind === "malformed"
                    ? "Heard you, but couldn’t read that as an expense."
                    : extraction.error,
              },
        ),
      );
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Asks any proxy in front not to hold the first line back.
      "X-Accel-Buffering": "no",
    },
  });
}

import { after, NextResponse } from "next/server";
import { extractTransactions } from "@/lib/extract";
import { recordCapture, recordExtraction, validDeviceId } from "@/lib/observe";

export const runtime = "nodejs"; // `postgres` requires it
export const maxDuration = 30;

/**
 * Text → structured transaction(s), for a capture that was typed.
 *
 * A spoken capture no longer comes through here: the transcribe route runs
 * extraction itself, so the phone makes one round trip. This is the typed
 * path, and the way back in for a spoken capture whose transcript was
 * corrected by hand. The extraction itself lives in lib/extract.ts.
 */
export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not set. Add it to .env.local." },
      { status: 500 },
    );
  }

  let text = "";
  let today = new Date().toISOString().slice(0, 10);
  // Present when the text began as a spoken capture, which already has a row.
  // Absent for one typed from scratch, which gets its row here.
  let priorCaptureId: string | null = null;
  let deviceId: string | null = null;
  try {
    const body = (await request.json()) as {
      text?: string;
      today?: string;
      captureId?: string;
      deviceId?: string;
    };
    text = (body.text ?? "").trim();
    // Goes into the prompt verbatim, so it is a date or it is ignored.
    if (typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today)) {
      today = body.today;
    }
    priorCaptureId = typeof body.captureId === "string" ? body.captureId : null;
    deviceId = validDeviceId(body.deviceId);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: "No text to interpret." }, { status: 400 });
  }

  // A typed capture never went through transcription, so it has no row yet.
  // It still belongs in the record; the extractor can be just as wrong about
  // text the user typed perfectly. Opened alongside the extraction rather than
  // after it, so the write costs the user no waiting.
  const opened: Promise<string | null> = priorCaptureId
    ? Promise.resolve(priorCaptureId)
    : recordCapture({
        id: crypto.randomUUID(),
        deviceId,
        source: "manual",
        transcript: text,
        asrVerdict: "skipped_typed",
      });

  const result = await extractTransactions(text, today, { apiKey });
  const captureId = await opened;

  after(async () => {
    if (!captureId) return;
    // The raw response is stored, not just the parsed fields. When extraction
    // is the suspect, the parsed view is exactly what cannot be trusted to
    // describe the failure.
    await recordExtraction(captureId, {
      model: result.model,
      raw: result.kind === "ok" ? result.raw
        : result.kind === "malformed" ? { content: result.content }
        : { error: result.error, detail: result.detail },
      error: result.kind === "ok" ? null
        : result.kind === "malformed" ? "malformed JSON"
        : result.error,
      ms: result.ms,
    });
  });

  if (result.kind === "malformed") {
    return NextResponse.json(
      { error: "The model returned malformed JSON.", detail: result.content },
      { status: 502 },
    );
  }
  if (result.kind === "error") {
    return NextResponse.json(
      { error: result.error, detail: result.detail },
      { status: result.status },
    );
  }

  console.log(
    `[extract] "${text}" -> ${result.transactions.length} txn(s) in ${result.ms}ms` +
      (result.transactions.length
        ? ": " +
          result.transactions
            .map((t) => `${t.amount} ${t.description ?? "-"}`)
            .join(" | ")
        : "  <-- EMPTY, user sees an error"),
  );

  return NextResponse.json({
    transactions: result.transactions,
    transcript: text,
    captureId,
  });
}

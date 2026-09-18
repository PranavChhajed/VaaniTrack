import { NextResponse } from "next/server";
import { DEFAULTS, type ExtractedTransaction } from "@/lib/types";
import { recordCapture, recordExtraction, validDeviceId } from "@/lib/observe";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

/**
 * Stage 2: text → structured transaction(s).
 *
 * This prompt is the product. The research (docs/RESEARCH.md §1.1) found that a
 * transcribe-then-interpret cascade reaches 95.6% on currency amounts against
 * 36.3% for raw ASR, so the reasoning that happens here is what makes the
 * amount trustworthy — not the transcription alone.
 *
 * Every rule below traces to a decision in docs/PRD-VaaniTrack.md §7.2.
 */
function buildSystemPrompt(today: string): string {
  return `Convert spoken expense notes (Indian English, rupees) into JSON.
Today is ${today}.

Shape: {"transactions":[{amount:number|null, description:string|null, category:string|null, payee:string|null, paymentMethod:string|null, date:"YYYY-MM-DD"|null, time:string|null, needsConfirmation:boolean, confirmationReason:string|null}]}
Plus a provenance for each of the 7 value fields, named <field>Provenance, one of: said | inferred | default | unknown.
said=stated outright, inferred=worked out confidently, default=you supplied it, unknown=not available (value MUST be null).

RULES
1. Never invent. Not said and not confidently inferable -> null + "unknown". A blank beats a guess.
2. Defaults, only when unstated: paymentMethod "${DEFAULTS.paymentMethod}", date ${today}. Both provenance "default". Anything stated overrides them as "said" ("300 lunch paid in cash" -> cash/said).
3. Category: infer only when obvious (lunch/chai->food, auto/uber->transport). Otherwise null+"unknown". Never use "other"/"misc" to avoid a blank.
4. time: null+"unknown" unless a clock time was actually spoken. Never "now".
5. Several expenses -> several array entries. Never merge or group.
6. Self-correction in one utterance -> ONE entry with the final value. "250, no wait 280" -> 280 only.
7. Explicit payment verb + person (paid/gave/sent/transferred) -> record normally: payee=person, category null+"unknown", needsConfirmation false. "Paid 500 to Rahul" -> 500, payee Rahul.
8. needsConfirmation true ONLY for genuine ambiguity that could record a wrong transaction — chiefly a bare amount+person with NO verb ("250 to Pushpa": paid? lent? owed?). Give a short confirmationReason. A missing category is NOT a reason. An unreadable amount IS.
9. Amounts: "two fifty"=250, "dhai sau"=250, "fifteen hundred"=1500, "1.5k"=1500, "ek lakh"=100000. This field must not be wrong — if unreadable, null+"unknown"+needsConfirmation true.
10. CURRENCY ARTIFACTS. Everything here is Indian rupees. A "$" in the text is ALWAYS a transcription error, never dollars. Speech-to-text writes spoken Indian amounts in dollar form, so read $N.MM as the digits that were actually spoken: "$2.50"->250 ("two fifty"), "$1.20"->120 ("one twenty"), "$15.00"->1500 ("fifteen hundred"), "$3.00"->300. Paise are not used in practice, so a trailing .50 or .20 is a misheard "fifty"/"twenty", not a fraction. Plain "$300" is simply 300.

No expense in the text -> {"transactions":[]}`;
}

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
  // Present for spoken captures, which already created a row in transcribe.
  // Absent for typed ones, which skip stage 1 entirely and get their row here.
  let captureId: string | null = null;
  let deviceId: string | null = null;
  try {
    const body = (await request.json()) as {
      text?: string;
      today?: string;
      captureId?: string;
      deviceId?: string;
    };
    text = (body.text ?? "").trim();
    if (body.today) today = body.today;
    captureId = typeof body.captureId === "string" ? body.captureId : null;
    deviceId = validDeviceId(body.deviceId);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: "No text to interpret." }, { status: 400 });
  }

  const started = Date.now();
  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(today) },
          { role: "user", content: text },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      // The free tier throttles on tokens-per-minute. Say so plainly rather
      // than reporting a generic failure the user can't act on.
      if (response.status === 429) {
        return NextResponse.json(
          {
            error: "Hit the API rate limit. Wait a few seconds and try again.",
            detail,
          },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { error: `Extraction failed (${response.status})`, detail },
        { status: 502 },
      );
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "The model returned nothing." },
        { status: 502 },
      );
    }

    let parsed: { transactions?: ExtractedTransaction[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      if (captureId) {
        await recordExtraction(captureId, {
          model: MODEL,
          raw: { content },
          error: "malformed JSON",
          ms: Date.now() - started,
        });
      }
      return NextResponse.json(
        { error: "The model returned malformed JSON.", detail: content },
        { status: 502 },
      );
    }

    const transactions = Array.isArray(parsed.transactions)
      ? parsed.transactions
      : [];

    // A typed capture never went through transcription, so it has no row yet.
    // It still belongs in the record — the extractor can be just as wrong
    // about text the user typed perfectly.
    if (!captureId) {
      captureId = await recordCapture({
        deviceId,
        source: "manual",
        transcript: text,
        asrVerdict: "skipped_typed",
      });
    }

    if (captureId) {
      // The raw response is stored, not just the parsed fields. When
      // extraction is the suspect, the parsed view is exactly what cannot be
      // trusted to describe the failure.
      await recordExtraction(captureId, {
        model: MODEL,
        raw: parsed,
        ms: Date.now() - started,
      });
    }

    console.log(
      `[extract] "${text}" -> ${transactions.length} txn(s)` +
        (transactions.length
          ? ": " +
            transactions
              .map((t) => `${t.amount} ${t.description ?? "-"}`)
              .join(" | ")
          : "  <-- EMPTY, user sees an error"),
    );

    return NextResponse.json({ transactions, transcript: text, captureId });
  } catch (error) {
    return NextResponse.json(
      { error: "Could not reach the extraction service.", detail: String(error) },
      { status: 502 },
    );
  }
}

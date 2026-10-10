import { DEFAULTS, type ExtractedTransaction } from "./types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export const EXTRACT_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

/**
 * Stage 2: text → structured transaction(s).
 *
 * This prompt is the product. The research (docs/RESEARCH.md §1.1) found that a
 * transcribe-then-interpret cascade reaches 95.6% on currency amounts against
 * 36.3% for raw ASR, so the reasoning that happens here is what makes the
 * amount trustworthy, not the transcription alone.
 *
 * Every rule below traces to a decision in docs/PRD-VaaniTrack.md §7.2.
 *
 * Lives here rather than in a route for two reasons: the transcribe route
 * calls it directly, so a spoken capture is one round trip from the phone
 * instead of two, and the replay harness (scripts/replay.ts) runs real
 * transcripts through exactly this code.
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
8. needsConfirmation true ONLY for genuine ambiguity that could record a wrong transaction: chiefly a bare amount+person with NO verb ("250 to Pushpa": paid? lent? owed?). Give a short confirmationReason. A missing category is NOT a reason. An unreadable amount IS.
9. Amounts: "two fifty"=250, "dhai sau"=250, "fifteen hundred"=1500, "1.5k"=1500, "ek lakh"=100000. This field must not be wrong: if unreadable, null+"unknown"+needsConfirmation true.
10. CURRENCY ARTIFACTS. Everything here is Indian rupees. A "$" in the text is ALWAYS a transcription error, never dollars. Speech-to-text writes spoken Indian amounts in dollar form, so read $N.MM as the digits that were actually spoken: "$2.50"->250 ("two fifty"), "$1.20"->120 ("one twenty"), "$15.00"->1500 ("fifteen hundred"), "$3.00"->300. Paise are not used in practice, so a trailing .50 or .20 is a misheard "fifty"/"twenty", not a fraction. Plain "$300" is simply 300.

No expense in the text -> {"transactions":[]}`;
}

export type ExtractResult =
  | {
      kind: "ok";
      model: string;
      transactions: ExtractedTransaction[];
      /** The parsed response exactly as the model gave it. Stored verbatim:
       *  when extraction is the suspect, the tidied view is the very thing
       *  that cannot be trusted to describe the failure. */
      raw: unknown;
      ms: number;
    }
  | { kind: "malformed"; model: string; content: string; ms: number }
  | {
      kind: "error";
      model: string;
      status: 429 | 502;
      error: string;
      detail: string;
      ms: number;
    };

export async function extractTransactions(
  text: string,
  today: string,
  opts: {
    apiKey: string;
    model?: string;
    /** Only the replay harness sets these; the app runs the defaults. */
    reasoningEffort?: "low" | "medium" | "high";
  },
): Promise<ExtractResult> {
  const model = opts.model ?? EXTRACT_MODEL;
  const started = Date.now();
  const elapsed = () => Date.now() - started;

  let content: string | undefined;
  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
        messages: [
          { role: "system", content: buildSystemPrompt(today) },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      // The free tier throttles on tokens-per-minute. Say so plainly rather
      // than reporting a generic failure the user can't act on.
      return response.status === 429
        ? {
            kind: "error",
            model,
            status: 429,
            error: "Hit the API rate limit. Wait a few seconds and try again.",
            detail,
            ms: elapsed(),
          }
        : {
            kind: "error",
            model,
            status: 502,
            error: `Extraction failed (${response.status})`,
            detail,
            ms: elapsed(),
          };
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    content = data.choices?.[0]?.message?.content;
  } catch (error) {
    return {
      kind: "error",
      model,
      status: 502,
      error: "Could not reach the extraction service.",
      detail: String(error),
      ms: elapsed(),
    };
  }

  if (!content) {
    return {
      kind: "error",
      model,
      status: 502,
      error: "The model returned nothing.",
      detail: "",
      ms: elapsed(),
    };
  }

  let parsed: { transactions?: ExtractedTransaction[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    return { kind: "malformed", model, content, ms: elapsed() };
  }

  return {
    kind: "ok",
    model,
    transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    raw: parsed,
    ms: elapsed(),
  };
}

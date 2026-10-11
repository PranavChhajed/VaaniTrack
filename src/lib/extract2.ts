import { finishRows } from "./finish";
import { DEFAULTS, type ExtractedTransaction, type PaymentMethod } from "./types";

/**
 * Stage 2, second version: text in, finished transactions out.
 *
 * The first version (extract.ts) asked the model for everything: the values, a
 * provenance for each of seven fields, the date, the defaults. Most of a reply's
 * time goes on the tokens the model writes, and half of them were provenance and
 * defaults that are really judgements about the transcript. This asks for the
 * values only, with a prompt that does not change from one request to the next,
 * and `finishRows` makes every judgement in code (see finish.ts).
 *
 * Which model and how much it should think are options, not constants, because
 * they are the thing being measured: scripts/eval.ts scores each combination on
 * the same cases before one is allowed to ship.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export const EXTRACT_V2_MODEL = process.env.GROQ_MODEL_V2 ?? process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

/**
 * The same for every request: no date, no payment default, nothing personal. A
 * prompt that never changes can be cached by the provider, which makes the part
 * of the wait that is reading it shorter.
 */
export const PROMPT_V2 = `Convert one spoken expense note (Indian English, rupees) into JSON. Reply with JSON only.

{"transactions":[{"amount":number|null,"description":string|null,"category":string|null,"payee":string|null,"paymentMethod":string|null,"dateWords":string|null,"time":string|null,"ask":string|null}]}

RULES
1. One entry per expense, in the order spoken. Never merge expenses. No expense at all -> {"transactions":[]}.
2. Never invent. If it was not said and is not obvious, use null. A blank is better than a guess.
3. amount: rupees, as a number. "two fifty"=250, "seven fifty"=750, "fifteen hundred"=1500, "1.5k"=1500, "dhai sau"=250, "ek lakh"=100000. A "$" or a price like "2.50" is the transcriber writing spoken digits as a price: "$2.50"=250, "$1.20"=120, "$15.00"=1500. If the speaker corrects themselves ("250, no wait, 280") give only the final amount, and one entry. If the amount cannot be read, null and ask.
4. description: what was bought or paid for, in the speaker's own word ("lunch", "auto", "phone bill"), else null.
5. category: only when obvious (lunch, chai -> "food"; auto, uber, petrol -> "transport"), else null. Never "other" or "misc".
6. payee: a person or shop that received the money, if named, else null. "Paid 500 to Rahul" -> payee "Rahul", amount 500, no ask.
7. paymentMethod: "Cash", "Card" or "UPI" ONLY if the speaker said how it was paid (cash, card, UPI, Google Pay, PhonePe, Paytm), and only for the expenses it was said about. Otherwise null.
8. dateWords: the exact words the speaker used for WHEN, copied as said ("yesterday", "last Friday", "3rd September", "two days ago", "this morning"). Otherwise null. Do not work out the date.
9. time: a clock time only if one was actually said ("5 pm" -> "17:00"). Otherwise null.
10. ask: a short question, only when recording could create a wrong transaction: an amount and a person with no verb ("250 to Pushpa": paid? lent? owed?), or an unreadable amount. A missing description or category is NOT a reason. Otherwise null.

EXAMPLES
"two fifty lunch" -> {"transactions":[{"amount":250,"description":"lunch","category":"food","payee":null,"paymentMethod":null,"dateWords":null,"time":null,"ask":null}]}
"300 for lunch yesterday and 100 coffee in cash" -> {"transactions":[{"amount":300,"description":"lunch","category":"food","payee":null,"paymentMethod":null,"dateWords":"yesterday","time":null,"ask":null},{"amount":100,"description":"coffee","category":"food","payee":null,"paymentMethod":"Cash","dateWords":null,"time":null,"ask":null}]}
"250 to Pushpa" -> {"transactions":[{"amount":250,"description":null,"category":null,"payee":"Pushpa","paymentMethod":null,"dateWords":null,"time":null,"ask":"Is this a payment to Pushpa, or money lent?"}]}`;

export type V2Options = {
  apiKey: string;
  model?: string;
  defaultPayment?: PaymentMethod;
  /** Only for models that reason (the gpt-oss family). Other models reject it. */
  reasoningEffort?: "low" | "medium" | "high";
  /** Replaces PROMPT_V2, for the scoreboard's experiments. */
  prompt?: string;
};

export type ExtractV2Result =
  | {
      kind: "ok";
      model: string;
      transactions: ExtractedTransaction[];
      raw: unknown;
      ms: number;
      amountChecks: ("match" | "mismatch" | "unread")[];
      usage: { prompt: number; completion: number } | null;
    }
  | { kind: "malformed"; model: string; content: string; ms: number }
  | { kind: "error"; model: string; status: 429 | 502; error: string; detail: string; ms: number };

export async function extractV2(text: string, today: string, opts: V2Options): Promise<ExtractV2Result> {
  const model = opts.model ?? EXTRACT_V2_MODEL;
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const reasons = /gpt-oss|qwen3|deepseek-r1/i.test(model);

  let content: string | undefined;
  let usage: { prompt: number; completion: number } | null = null;
  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        ...(reasons && opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
        messages: [
          { role: "system", content: opts.prompt ?? PROMPT_V2 },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = await response.text();
      return response.status === 429
        ? { kind: "error", model, status: 429, error: "Hit the API rate limit. Wait a few seconds and try again.", detail, ms: elapsed() }
        : { kind: "error", model, status: 502, error: `Extraction failed (${response.status})`, detail, ms: elapsed() };
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    content = data.choices?.[0]?.message?.content;
    if (data.usage) usage = { prompt: data.usage.prompt_tokens ?? 0, completion: data.usage.completion_tokens ?? 0 };
  } catch (error) {
    return { kind: "error", model, status: 502, error: "Could not reach the extraction service.", detail: String(error), ms: elapsed() };
  }

  if (!content) {
    return { kind: "error", model, status: 502, error: "The model returned nothing.", detail: "", ms: elapsed() };
  }
  let parsed: { transactions?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    return { kind: "malformed", model, content, ms: elapsed() };
  }

  const finished = finishRows(parsed.transactions, text, today, opts.defaultPayment ?? DEFAULTS.paymentMethod);
  return {
    kind: "ok",
    model,
    transactions: finished.transactions,
    raw: parsed,
    ms: elapsed(),
    amountChecks: finished.amountChecks,
    usage,
  };
}

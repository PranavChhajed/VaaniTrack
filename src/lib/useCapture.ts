"use client";

import { useCallback, useState } from "react";
import { useRecorder } from "./useRecorder";
import {
  toTransaction,
  type ExtractedTransaction,
  type Transaction,
} from "./types";

export type Pending = {
  transaction: Transaction;
  needsConfirmation: boolean;
  confirmationReason: string | null;
};

/** Everything a screen needs to drive a capture. */
export type Capture = ReturnType<typeof useCapture>;

type Reply =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; message: string; detail: string };

/**
 * POST and parse, keeping the failure modes apart.
 *
 * There is no console on a phone, so a single catch-all "something went wrong"
 * is the end of the investigation — it was, once, for a capture that had
 * already recorded 15 KB of perfectly good audio. These three cases need
 * different messages because they call for different actions:
 *
 *   - the request never landed (connection dropped, shared link expired)
 *   - it landed and came back as something that isn't JSON (a proxy error
 *     page in front of a server that is no longer there)
 *   - it came back correctly, reporting an error of its own
 *
 * Only the third is the server talking to us. The first two used to be
 * indistinguishable from it.
 */
async function postJson(url: string, init: RequestInit): Promise<Reply> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    return {
      ok: false,
      message:
        "Couldn’t reach the server — the connection dropped. If you opened this from a shared link, that link may have expired.",
      detail: `network: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const raw = await res.text().catch(() => "");
  try {
    return { ok: true, status: res.status, body: JSON.parse(raw) };
  } catch {
    return {
      ok: false,
      message: `The server answered with something unreadable (HTTP ${res.status}). It may be restarting.`,
      detail: `non-JSON ${res.status}: ${raw.slice(0, 140) || "(empty body)"}`,
    };
  }
}

/**
 * The capture pipeline — record or type, transcribe, extract, gate, save.
 *
 * Lifted out of the capture screen so the journal can record onto a chosen day
 * without cloning any of it. The two callers differ in exactly one way, which
 * is `captureDate`; everything else about how an utterance becomes a
 * transaction has to stay identical, and sharing the code is the only way to
 * guarantee that.
 */
export function useCapture({
  captureDate = null,
  onLogged,
  onUndo,
}: {
  /**
   * The day a capture lands on when the speaker didn't name one. Null means
   * today, which is the capture screen's behaviour and the extractor's own
   * default. The journal passes the date being viewed.
   */
  captureDate?: string | null;
  onLogged: (saved: Transaction[]) => void;
  onUndo: (ids: string[]) => void;
}) {
  const { state, error: recorderError, level, start, stop } = useRecorder();
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [justSaved, setJustSaved] = useState<Transaction[] | null>(null);

  /**
   * Put a capture on the day being viewed — unless the speaker named a day.
   *
   * A spoken date is the one thing that outranks the journal's position. Where
   * you happen to be looking is context; what you actually said is evidence,
   * and evidence wins. Anything the extractor merely defaulted to today is
   * fair game to move.
   */
  const placeOnDate = useCallback(
    (t: Transaction): Transaction => {
      if (!captureDate) return t;
      if (t.date.provenance === "said") return t;
      return { ...t, date: { value: captureDate, provenance: "said" } };
    },
    [captureDate],
  );

  /**
   * Shared tail of both capture paths.
   *
   * `heardWell` is false when the transcript itself is shaky. A disfluent
   * transcript with a plausible-looking number in it is the dangerous case:
   * the extractor will happily produce a confident transaction from words the
   * recogniser was guessing at.
   */
  const interpret = useCallback(
    async (text: string, heardWell = true) => {
      const reply = await postJson("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          // Always the real today, even when recording onto an earlier day, so
          // that "yesterday" keeps meaning yesterday rather than being measured
          // from whichever page happens to be open.
          today: new Date().toISOString().slice(0, 10),
        }),
      });
      if (!reply.ok) {
        setError(reply.message);
        setDebug(reply.detail);
        return;
      }

      const extracted = reply.body as {
        error?: string;
        transactions?: ExtractedTransaction[];
      };
      if (reply.status !== 200) {
        setError(extracted.error ?? "Could not read that as an expense.");
        return;
      }

      const rows = (extracted.transactions ?? []) as ExtractedTransaction[];
      if (rows.length === 0) {
        setError(`No expense found in “${text}”. Try including an amount.`);
        return;
      }

      // Confidence gate. Log straight through when the model is sure, and only
      // stop the user when it isn't. Both conditions matter:
      //   - the extractor did not flag the utterance as ambiguous, and
      //   - the amount was explicitly heard, not inferred or defaulted.
      // The amount is the one field that must never be silently wrong, so
      // anything short of "said" earns a review rather than a save.
      const confident = (row: ExtractedTransaction) =>
        heardWell &&
        !row.needsConfirmation &&
        row.amount !== null &&
        row.amountProvenance === "said";

      const auto = rows.filter(confident);
      const review = rows.filter((row) => !confident(row));

      if (auto.length > 0) {
        const saved = auto.map((row) => placeOnDate(toTransaction(row, text)));
        onLogged(saved);
        // Logged, not silent: say what was recorded and offer a way back.
        setJustSaved(saved);
      }

      // FR-5: several expenses in one utterance stay separate transactions.
      if (review.length > 0) {
        setPending((prev) => [
          ...prev,
          ...review.map((row) => ({
            transaction: placeOnDate(toTransaction(row, text)),
            needsConfirmation: true,
            confirmationReason:
              row.confirmationReason ??
              (row.amount === null
                ? "Didn’t catch the amount — what was it?"
                : !heardWell
                  ? "That wasn’t heard cleanly — check the amount."
                  : "Check the amount before this is saved."),
          })),
        ]);
      }
    },
    [onLogged, placeOnDate],
  );

  const handleStop = useCallback(async () => {
    const result = await stop();

    // Every failure path here used to return silently, which on a phone with
    // no devtools looks exactly like the app being broken. Say what happened.
    if (!result.ok) {
      setError(result.reason);
      setDebug(null);
      return;
    }

    setBusy(true);
    setError(null);
    setJustSaved(null);
    setDebug(
      `captured ${(result.blob.size / 1024).toFixed(0)} KB · ${result.mimeType} · ${result.ms} ms`,
    );

    try {
      const form = new FormData();
      form.append("audio", result.blob, "capture");

      const reply = await postJson("/api/transcribe", {
        method: "POST",
        body: form,
      });
      if (!reply.ok) {
        // The audio was captured fine — say so, so this doesn't read as a
        // recording failure and send the user hunting for a mic problem.
        setError(reply.message);
        setDebug(
          `${reply.detail} · your ${(result.blob.size / 1024).toFixed(0)} KB recording was fine`,
        );
        return;
      }

      const transcribed = reply.body as {
        text?: string;
        confidence?: number;
        error?: string;
        debug?: unknown;
      };
      if (reply.status !== 200) {
        setError(transcribed.error ?? "Could not transcribe that.");
        if (transcribed.debug) {
          setDebug(`transcribe: ${JSON.stringify(transcribed.debug)}`);
        }
        return;
      }
      // Whisper's mean avg_logprob, used only as a backstop — the extractor's
      // own ambiguity flag is the primary gate. Calibrated against a known-good
      // transcript ("250 lunch.") which scores -0.64, so the threshold has to
      // sit below that or correct captures would be sent to review. Deliberately
      // generous; it exists to catch audio that was largely guessed at.
      const heardWell = (transcribed.confidence ?? 0) > -0.9;

      // A 200 with no text should not happen, but if it does the extractor
      // would be handed "undefined" and asked to find an expense in it.
      const heard = (transcribed.text ?? "").trim();
      if (!heard) {
        setError("Didn’t catch anything there. Try again, a bit closer to the mic.");
        setDebug(`empty transcript · ${(result.blob.size / 1024).toFixed(0)} KB sent`);
        return;
      }

      setDebug(
        `heard “${heard}”  ·  confidence ${(transcribed.confidence ?? 0).toFixed(2)}${heardWell ? "" : " — will ask you to check"}`,
      );
      await interpret(heard, heardWell);
    } catch (err) {
      // Anything reaching here is a bug in our own handling, not a transport
      // failure — postJson already turned those into messages above.
      setError("Something went wrong handling that recording.");
      setDebug(`unexpected: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [stop, interpret]);

  /**
   * Typing the same thing you'd say.
   *
   * This is not a lesser path. The source document's own example of existing
   * behaviour was typing "250 lunch" into WhatsApp, so text is the behaviour
   * the product was modelled on. It also means a refused microphone, a noisy
   * room, or a browser having a bad day is an inconvenience rather than the
   * end of the demo.
   */
  const submitTyped = useCallback(async () => {
    const text = typed.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setJustSaved(null);
    setDebug(`typed “${text}”`);
    try {
      await interpret(text);
      setTyped("");
    } catch {
      setError("Something went wrong on the way to the server.");
    } finally {
      setBusy(false);
    }
  }, [typed, busy, interpret]);

  const commit = useCallback(
    (index: number, transaction: Transaction) => {
      onLogged([transaction]);
      setPending((prev) => prev.filter((_, i) => i !== index));
    },
    [onLogged],
  );

  const discard = useCallback((index: number) => {
    setPending((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const undo = useCallback(() => {
    if (!justSaved) return;
    onUndo(justSaved.map((t) => t.id));
    setJustSaved(null);
  }, [justSaved, onUndo]);

  return {
    state,
    level,
    busy,
    error: error ?? recorderError,
    debug,
    typed,
    setTyped,
    pending,
    justSaved,
    start,
    stop: handleStop,
    submitTyped,
    commit,
    discard,
    undo,
  };
}

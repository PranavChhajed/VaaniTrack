"use client";

import { useCallback, useRef, useState } from "react";
import { useRecorder } from "./useRecorder";
import { audioConsent, deviceId } from "./device";
import { todayISO } from "./journal";
import { loadSettings } from "./settings";
import {
  changedFields,
  gateFailures,
  reportEvent,
  reportGate,
  reportTiming,
  reportTransactions,
} from "./report";
import {
  toTransaction,
  type ExtractedTransaction,
  type Transaction,
} from "./types";

export type Pending = {
  transaction: Transaction;
  needsConfirmation: boolean;
  confirmationReason: string | null;
  /** The utterance this came from, so a later save or discard can be traced. */
  captureId: string | null;
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
 * is the end of the investigation; it was, once, for a capture that had
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
        "Couldn’t reach the server; the connection dropped. If you opened this from a shared link, that link may have expired.",
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
 * POST a recording and read the reply as it arrives.
 *
 * A capture that was heard answers in two lines of JSON on one response: what
 * was heard, as soon as the transcriber has it, then the result. `onHeard`
 * fires on the first, so the speaker is looking at their own words while the
 * extraction is still running. Anything else the route sends (a rejection, an
 * error) is ordinary JSON, and is handled exactly as `postJson` would.
 */
async function postCapture(
  form: FormData,
  onHeard: (text: string) => void,
): Promise<Reply> {
  let res: Response;
  try {
    res = await fetch("/api/transcribe", { method: "POST", body: form });
  } catch (err) {
    return {
      ok: false,
      message:
        "Couldn’t reach the server; the connection dropped. If you opened this from a shared link, that link may have expired.",
      detail: `network: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const unreadable = (raw: string): Reply => ({
    ok: false,
    message: `The server answered with something unreadable (HTTP ${res.status}). It may be restarting.`,
    detail: `non-JSON ${res.status}: ${raw.slice(0, 140) || "(empty body)"}`,
  });

  const streamed = res.headers.get("Content-Type")?.includes("ndjson");
  if (!streamed || !res.body) {
    const raw = await res.text().catch(() => "");
    try {
      return { ok: true, status: res.status, body: JSON.parse(raw) };
    } catch {
      return unreadable(raw);
    }
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let last: Record<string, unknown> | null = null;
  const take = (text: string) => {
    if (!text.trim()) return;
    last = JSON.parse(text) as Record<string, unknown>;
    if (typeof last.heard === "string") onHeard(last.heard);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffered.indexOf("\n")) >= 0) {
        take(buffered.slice(0, newline));
        buffered = buffered.slice(newline + 1);
      }
    }
    take(buffered + decoder.decode());
  } catch (err) {
    // The connection went, or a line was not JSON. Whatever was heard before
    // that has already been handed to `onHeard`.
    return {
      ok: false,
      message:
        "The connection dropped before that finished. Check what was heard below, or try again.",
      detail: `stream: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return last ? { ok: true, status: res.status, body: last } : unreadable("");
}

/** `performance.now()` where it exists; only ever used for a difference. */
const clock = () =>
  typeof performance === "undefined" ? Date.now() : performance.now();

/**
 * The capture pipeline: record or type, transcribe, extract, gate, save.
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
  // What the transcriber made of the take, shown while the rest is worked out.
  const [heard, setHeard] = useState<string | null>(null);
  // The last transcript this hook put in the text box by itself, so it can
  // take it back out. Anything the user typed or changed is theirs to keep.
  const offeredRef = useRef<string | null>(null);

  /** Hand a transcript back as text, to be corrected rather than re-spoken. */
  const offer = useCallback((text: string) => {
    offeredRef.current = text;
    setTyped(text);
  }, []);
  const [justSaved, setJustSaved] = useState<Transaction[] | null>(null);
  const [lastCaptureId, setLastCaptureId] = useState<string | null>(null);

  /**
   * Put a capture on the day being viewed, unless the speaker named a day.
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
   * Shared tail of both capture paths: gate what was extracted, then save or
   * ask.
   *
   * `heardWell` is false when the transcript itself is shaky. A disfluent
   * transcript with a plausible-looking number in it is the dangerous case:
   * the extractor will happily produce a confident transaction from words the
   * recogniser was guessing at.
   */
  const settle = useCallback(
    (
      text: string,
      rows: ExtractedTransaction[],
      captureId: string | null,
      heardWell: boolean,
      source: Transaction["source"],
    ) => {
      // Confidence gate. Log straight through when the model is sure, and only
      // stop the user when it isn't. Both conditions matter:
      //   - the extractor did not flag the utterance as ambiguous, and
      //   - the amount was explicitly heard, not inferred or defaulted.
      // The amount is the one field that must never be silently wrong, so
      // anything short of "said" earns a review rather than a save.
      //
      // And one that is the person's, not the app's: "always let me check"
      // sends everything to review, sure or not. It can only add caution,
      // never remove it.
      const { reviewAll } = loadSettings();
      const failures = (row: ExtractedTransaction) =>
        gateFailures(row, heardWell, reviewAll);
      const confident = (row: ExtractedTransaction) => failures(row).length === 0;

      const auto = rows.filter(confident);
      const review = rows.filter((row) => !confident(row));

      const savedByRow = new Map<ExtractedTransaction, Transaction>();

      if (auto.length > 0) {
        const saved = auto.map((row) => {
          const t = placeOnDate(toTransaction(row, text, source));
          savedByRow.set(row, t);
          return t;
        });
        onLogged(saved);
        // Logged, not silent: say what was recorded and offer a way back.
        setJustSaved(saved);
        setLastCaptureId(captureId ?? null);
        reportTransactions(saved, captureId);
      }

      // The gate's verdict per row, naming which conditions blocked a save.
      // This is the difference between knowing an expense went to review and
      // knowing why, the only version of that fact worth recording.
      if (captureId) {
        reportGate(
          captureId,
          rows.map((row, idx) => ({
            idx,
            transactionId: savedByRow.get(row)?.id ?? null,
            extracted: row,
            outcome: confident(row) ? ("auto_saved" as const) : ("review" as const),
            failed: failures(row),
          })),
        );
      }

      /** Held back for no reason but the person asking to see everything. */
      const onlyByChoice = (row: ExtractedTransaction) => {
        const failed = failures(row);
        return failed.length === 1 && failed[0] === "review_mode";
      };

      // FR-5: several expenses in one utterance stay separate transactions.
      if (review.length > 0) {
        setPending((prev) => [
          ...prev,
          ...review.map((row) => ({
            transaction: placeOnDate(toTransaction(row, text, source)),
            // Not "the app is unsure" when the only reason is the person's own
            // choice to check everything: no warning banner, and the card
            // opens in its reading view rather than its edit form.
            needsConfirmation: !onlyByChoice(row),
            captureId: captureId ?? null,
            confirmationReason: onlyByChoice(row)
              ? null
              : (row.confirmationReason ??
              (row.amount === null
                ? "Didn’t catch the amount. What was it?"
                : !heardWell
                  ? "That wasn’t heard cleanly. Check the amount."
                  : "Check the amount before this is saved.")),
          })),
        ]);
      }
    },
    [onLogged, placeOnDate],
  );

  /** The typed path: text straight to the extractor. True if it was read. */
  const interpret = useCallback(
    async (text: string): Promise<boolean> => {
      const started = clock();
      const reply = await postJson("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          // Always the real today, even when recording onto an earlier day, so
          // that "yesterday" keeps meaning yesterday rather than being measured
          // from whichever page happens to be open. The speaker's own calendar
          // day, not UTC's.
          today: todayISO(),
          defaultPayment: loadSettings().defaultPayment,
          deviceId: deviceId(),
        }),
      });
      if (!reply.ok) {
        setError(reply.message);
        setDebug(reply.detail);
        return false;
      }

      const extracted = reply.body as {
        error?: string;
        transactions?: ExtractedTransaction[];
        captureId?: string | null;
      };
      if (reply.status !== 200) {
        setError(extracted.error ?? "Could not read that as an expense.");
        return false;
      }

      const rows = extracted.transactions ?? [];
      if (rows.length === 0) {
        setError(`No expense found in “${text}”. Try including an amount.`);
        return false;
      }

      settle(text, rows, extracted.captureId ?? null, true, "manual");
      reportTiming(extracted.captureId ?? null, clock() - started);
      return true;
    },
    [settle],
  );

  const handleStop = useCallback(async () => {
    const started = clock();
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
    // A new take replaces the last one's leftover transcript, if it is still
    // sitting in the text box untouched.
    setTyped((prev) => (prev === offeredRef.current ? "" : prev));
    offeredRef.current = null;
    const levels =
      result.peakDb === null
        ? ""
        : ` · peak ${result.peakDb.toFixed(0)} dB`;
    setDebug(
      `captured ${(result.blob.size / 1024).toFixed(0)} KB · ${result.mimeType} · ${result.ms} ms${levels}`,
    );

    try {
      const form = new FormData();
      form.append("audio", result.blob, "capture");
      const id = deviceId();
      if (id) form.append("deviceId", id);
      // The server keeps the recording only if this says so. It can only ever
      // reduce what is retained, never unlock anything.
      form.append("audioConsent", audioConsent());
      form.append("audioMs", String(result.ms));
      // What the microphone actually delivered, measured on the device. The
      // server cannot derive this: it receives Opus, which spends the same
      // bitrate on silence as on speech, so a silent take arrives looking
      // exactly like a good one.
      if (result.peakDb !== null && Number.isFinite(result.peakDb)) {
        form.append("peakDb", result.peakDb.toFixed(2));
      }
      if (result.meanDb !== null && Number.isFinite(result.meanDb)) {
        form.append("meanDb", result.meanDb.toFixed(2));
      }
      // How long the mic took to start carrying sound. Only the device can
      // observe this, and it is the difference between a handset that works
      // and one that does not.
      if (result.warmupMs !== null) {
        form.append("warmupMs", String(result.warmupMs));
      }
      form.append("today", todayISO());
      form.append("defaultPayment", loadSettings().defaultPayment);

      let early = "";
      const reply = await postCapture(form, (text) => {
        early = text;
        setHeard(text);
      });
      if (!reply.ok) {
        // The audio was captured fine, say so, so this doesn't read as a
        // recording failure and send the user hunting for a mic problem.
        setError(reply.message);
        // Heard, then lost on the way back: keep the words.
        if (early) offer(early);
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
        captureId?: string | null;
        /** Words that were heard but could not be used as they stand. */
        heard?: string | null;
        transactions?: ExtractedTransaction[];
        extractError?: string;
      };
      if (reply.status !== 200) {
        setError(transcribed.error ?? "Could not transcribe that.");
        if (transcribed.debug) {
          setDebug(`transcribe: ${JSON.stringify(transcribed.debug)}`);
        }
        // Real words with the number lost. Put them in the text box: fixing
        // one word there is quicker, and far surer, than saying it all again.
        if (transcribed.heard) offer(transcribed.heard);
        return;
      }
      // Whisper's mean avg_logprob, used only as a backstop; the extractor's
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
        `heard “${heard}”  ·  confidence ${(transcribed.confidence ?? 0).toFixed(2)}${heardWell ? "" : ", will ask you to check"}`,
      );

      // Heard, but nothing could be made of it. The words are kept and offered
      // back as text rather than asking for the recording a second time.
      const rows = transcribed.transactions ?? [];
      if (transcribed.extractError || rows.length === 0) {
        setError(
          transcribed.extractError ??
            `No expense found in “${heard}”. Fix it below, or try again.`,
        );
        offer(heard);
        return;
      }

      settle(heard, rows, transcribed.captureId ?? null, heardWell, "voice");
      reportTiming(transcribed.captureId ?? null, clock() - started);
    } catch (err) {
      // Anything reaching here is a bug in our own handling, not a transport
      // failure; postJson already turned those into messages above.
      setError("Something went wrong handling that recording.");
      setDebug(`unexpected: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
      setHeard(null);
    }
  }, [stop, settle, offer]);

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
      // Cleared only once it has been read: text that failed stays in the
      // box to be corrected, not retyped.
      if (await interpret(text)) setTyped("");
    } catch {
      setError("Something went wrong on the way to the server.");
    } finally {
      setBusy(false);
    }
  }, [typed, busy, interpret]);

  const commit = useCallback(
    (index: number, transaction: Transaction) => {
      const item = pending[index];
      // What the model proposed, against what the user accepted. A review the
      // user changed and a review they waved through are very different
      // signals, and only the comparison tells them apart.
      if (item) {
        reportEvent("review_saved", {
          captureId: item.captureId,
          transactionId: transaction.id,
          before: item.transaction,
          after: transaction,
          changedFields: changedFields(item.transaction, transaction),
        });
      }
      reportTransactions([transaction], item?.captureId ?? null);
      onLogged([transaction]);
      setPending((prev) => prev.filter((_, i) => i !== index));
    },
    [onLogged, pending],
  );

  /** Take in reviews captured elsewhere (the Android widget), to be confirmed here. */
  const adopt = useCallback((items: Pending[]) => {
    if (items.length === 0) return;
    setPending((prev) => [...prev, ...items]);
  }, []);

  const discard = useCallback(
    (index: number) => {
      const item = pending[index];
      // A discard is the strongest possible statement that the pipeline got it
      // wrong: the user looked at the proposal and rejected it outright.
      if (item) {
        reportEvent("review_discarded", {
          captureId: item.captureId,
          transactionId: item.transaction.id,
          before: item.transaction,
        });
      }
      setPending((prev) => prev.filter((_, i) => i !== index));
    },
    [pending],
  );

  const undo = useCallback(() => {
    if (!justSaved) return;
    // Reported before the local state drops them: an undone auto-save means
    // the gate let through something it shouldn't have, and once the rows are
    // gone from localStorage there is nothing left to say so.
    for (const t of justSaved) {
      reportEvent("undone", {
        captureId: lastCaptureId,
        transactionId: t.id,
        before: t,
      });
    }
    onUndo(justSaved.map((t) => t.id));
    setJustSaved(null);
  }, [justSaved, onUndo, lastCaptureId]);

  /**
   * Keep the "Logged" confirmation in step with a correction made from it.
   *
   * The confirmation is the quickest way to fix a mishear, so its rows can be
   * opened and edited. Without this it would go on announcing the amount that
   * was just corrected.
   */
  const amend = useCallback((next: Transaction) => {
    setJustSaved((prev) =>
      prev ? prev.map((t) => (t.id === next.id ? next : t)) : prev,
    );
  }, []);

  /** Drop a row from the confirmation once it has been deleted elsewhere. */
  const forget = useCallback((id: string) => {
    setJustSaved((prev) => {
      if (!prev) return prev;
      const left = prev.filter((t) => t.id !== id);
      return left.length > 0 ? left : null;
    });
  }, []);

  return {
    state,
    level,
    busy,
    heard,
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
    adopt,
    undo,
    amend,
    forget,
  };
}

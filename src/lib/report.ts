"use client";

import { deviceId } from "./device";
import type { Transaction } from "./types";

/**
 * Fire-and-forget reporting to the observability endpoint.
 *
 * Nothing here is awaited by the capture path and nothing here can throw into
 * it. The rule from the server side holds on the client too: a diagnostic that
 * fails must cost a data point, never a transaction.
 */
function send(body: unknown): void {
  try {
    void fetch("/api/observe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* reporting is never load-bearing */
  }
}

/**
 * Which gate conditions blocked an automatic save.
 *
 * The names matter more than the boolean. "It went to review" is not
 * actionable; "the amount was inferred rather than heard" tells you whether to
 * look at the transcriber, the prompt, or the threshold.
 */
export function gateFailures(
  row: {
    amount: number | null;
    amountProvenance: string;
    needsConfirmation: boolean;
  },
  heardWell: boolean,
  /** The person asked to check every entry, whatever the app thinks. */
  reviewAll = false,
): string[] {
  const failed: string[] = [];
  if (!heardWell) failed.push("audio_unclear");
  if (row.needsConfirmation) failed.push("extractor_flagged_ambiguous");
  if (row.amount === null) failed.push("amount_missing");
  else if (row.amountProvenance !== "said") failed.push("amount_not_said");
  // Last, so "review_mode" alone means the app itself had no doubt.
  if (reviewAll) failed.push("review_mode");
  return failed;
}

export function reportGate(
  captureId: string,
  rows: {
    idx: number;
    transactionId: string | null;
    extracted: unknown;
    outcome: "auto_saved" | "review";
    failed: string[];
  }[],
): void {
  if (!captureId || rows.length === 0) return;
  send({ kind: "gate", captureId, rows });
}

/**
 * Tap-to-result, as the device experienced it.
 *
 * The server can time its own stages but not the wait the user actually sat
 * through, which also includes the network on either side of them.
 */
export function reportTiming(captureId: string | null, totalMs: number): void {
  if (!captureId) return;
  send({ kind: "timing", captureId, totalMs: Math.round(totalMs) });
}

/** Mirror transactions to the durable copy. localStorage stays the cache. */
export function reportTransactions(
  transactions: Transaction[],
  captureId?: string | null,
): void {
  const id = deviceId();
  if (!id || transactions.length === 0) return;
  send({ kind: "transaction", deviceId: id, captureId: captureId ?? null, transactions });
}

/**
 * What the user did about a transaction.
 *
 * Undo, edit and delete all destroy the evidence in localStorage, so this must
 * be called *before* the local state changes; `before` is the only surviving
 * record of what the model originally proposed.
 */
export function reportEvent(
  action:
    | "auto_saved"
    | "review_saved"
    | "review_discarded"
    | "undone"
    | "edited"
    | "deleted",
  opts: {
    captureId?: string | null;
    transactionId?: string | null;
    before?: unknown;
    after?: unknown;
    changedFields?: string[];
  } = {},
): void {
  const id = deviceId();
  if (!id) return;
  send({ kind: "event", deviceId: id, action, ...opts });
}

/** Soft-delete in the durable copy; the row survives for the portal. */
export function reportDelete(transactionId: string): void {
  const id = deviceId();
  if (!id) return;
  send({ kind: "delete", deviceId: id, id: transactionId });
}

/** Which fields actually changed, for an edit event. */
export function changedFields(before: Transaction, after: Transaction): string[] {
  const keys = [
    "amount",
    "description",
    "category",
    "payee",
    "paymentMethod",
    "date",
    "time",
  ] as const;
  return keys.filter(
    (k) => before[k]?.value !== after[k]?.value,
  );
}

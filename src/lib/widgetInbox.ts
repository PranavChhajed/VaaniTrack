import { readLocal, writeLocal } from "./localStore";
import { sanitizeTransaction, type Transaction } from "./types";

/**
 * Expenses the Android widget captured while the app was closed.
 *
 * The widget is native and cannot write to the journal, which lives in the
 * browser's storage for this site. So it keeps its own small queue and, the
 * next time the app is opened, passes it in on the address (`?inbox=`, base64
 * of a JSON list). The other half is `AppLauncher.java` in `android/`.
 *
 * Two kinds ride along:
 *
 *   saved    the app was sure (the same gate as a typed or spoken capture here).
 *            Goes straight into the journal, as if it had been logged on screen.
 *   review   the app was unsure. Never saved by the widget; it arrives as a
 *            review card on the capture screen, for the person to confirm.
 *
 * The queue hands each item over twice, as a safety net against a page that
 * died half way, so everything here must be safe to see twice: ids already
 * seen are skipped, and they are remembered even after the entry is deleted,
 * or deleting an expense would bring it back on the next open.
 */

export const INBOX_PARAM = "inbox";
const SEEN_KEY = "vaanitrack.inboxSeen";
const SEEN_MAX = 300;

export type InboxItem = {
  kind: "saved" | "review";
  transaction: Transaction;
  /** For a review: why the app is unsure, in the words the review card shows. */
  reason: string | null;
  /** For a review: whether to warn (false when the person simply asked to check everything). */
  needsConfirmation: boolean;
  /** The server's id for the capture, so a later save or discard traces back to it. */
  captureId: string | null;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The packed list from an address's query string, or null when there is none. */
export function inboxParam(search: string): string | null {
  const value = new URLSearchParams(search).get(INBOX_PARAM);
  return value && value.length > 0 ? value : null;
}

/** Base64url, as the widget writes it, back to text. Null if it is not valid. */
function unpack(packed: string): string | null {
  try {
    const b64 = packed.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * What the widget sent, made safe.
 *
 * It arrives on an address, which anyone could have typed, so nothing in it
 * is trusted: each transaction is rebuilt field by field by the same
 * `sanitizeTransaction` the journal uses for damaged storage, and anything
 * that does not survive that is dropped.
 */
export function decodeInbox(packed: string): InboxItem[] {
  const text = unpack(packed);
  if (text === null) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const out: InboxItem[] = [];
  raw.slice(0, 40).forEach((entry, i) => {
    if (!isRecord(entry)) return;
    const kind = entry.k === "review" ? "review" : entry.k === "saved" ? "saved" : null;
    if (!kind) return;
    const transaction = sanitizeTransaction(entry.t, i);
    if (!transaction) return;
    // A widget capture is always a voice one, whatever the packed copy says.
    out.push({
      kind,
      transaction: { ...transaction, source: "voice" },
      reason: typeof entry.reason === "string" ? entry.reason.slice(0, 200) : null,
      needsConfirmation: entry.needs === true,
      captureId: typeof entry.cap === "string" ? entry.cap.slice(0, 80) : null,
    });
  });
  return out;
}

function readSeen(): string[] {
  try {
    const parsed = JSON.parse(readLocal(SEEN_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Remember these ids, so they are never taken in a second time. */
export function markSeen(ids: string[]): void {
  if (ids.length === 0) return;
  const next = [...readSeen(), ...ids];
  writeLocal(SEEN_KEY, JSON.stringify(Array.from(new Set(next)).slice(-SEEN_MAX)));
}

/**
 * What in an inbox is new.
 *
 * `inJournal` are ids already in the journal. An item is new only if it is in
 * neither that nor the remembered list. Saved items are remembered here, as
 * they go into the journal. Reviews are not: they are remembered only once
 * the capture screen has taken them (`markSeen`), so a reload before that
 * cannot lose one the person never got to see.
 */
export function takeNew(items: InboxItem[], inJournal: Set<string>): InboxItem[] {
  const seen = new Set(readSeen());
  const fresh = items.filter(
    (item) => !seen.has(item.transaction.id) && !inJournal.has(item.transaction.id),
  );
  markSeen(fresh.filter((i) => i.kind === "saved").map((i) => i.transaction.id));
  return fresh;
}

/* ---- Reviews waiting for the capture screen ------------------------------------
   The inbox is read in the app's layout, which is on every screen, but a review
   card only exists on the capture screen. This is the hand-off between the two:
   a plain list, with a subscription, that the capture screen empties. */

let waiting: InboxItem[] = [];
const listeners = new Set<() => void>();
const NONE: InboxItem[] = [];

export function holdForReview(items: InboxItem[]): void {
  if (items.length === 0) return;
  waiting = [...waiting, ...items];
  listeners.forEach((l) => l());
}

export function clearReviews(): void {
  if (waiting.length === 0) return;
  waiting = [];
  listeners.forEach((l) => l());
}

export function subscribeReviews(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reviewSnapshot(): InboxItem[] {
  return waiting.length === 0 ? NONE : waiting;
}

export function reviewServerSnapshot(): InboxItem[] {
  return NONE;
}

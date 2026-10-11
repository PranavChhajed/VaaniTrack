"use client";

import { useEffect, useState } from "react";
import { reportTransactions } from "@/lib/report";
import { noteShell } from "@/lib/shell";
import { loadTransactions } from "@/lib/types";
import { useTransactions } from "@/lib/useTransactions";
import {
  decodeInbox,
  holdForReview,
  inboxParam,
  takeNew,
  type InboxItem,
} from "@/lib/widgetInbox";

/**
 * Collects what the Android widget captured while the app was closed.
 *
 * Mounted once in the app's layout so it runs on whichever screen the app
 * opens to. It has no face except a short line saying what arrived. See
 * `lib/widgetInbox.ts` for what the widget sends and why it is safe to see
 * the same item twice.
 */

/** The address that was already handled, so a second mount does not redo it. */
let handled: string | null = null;

export function WidgetInbox() {
  const { add } = useTransactions();
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    noteShell(document.referrer);

    const packed = inboxParam(window.location.search);
    if (!packed || packed === handled) return;
    handled = packed;

    // Off the address first: a reload, or Back, must never run it again.
    const url = new URL(window.location.href);
    url.searchParams.delete("inbox");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);

    const inJournal = new Set(loadTransactions().map((t) => t.id));
    const fresh: InboxItem[] = takeNew(decodeInbox(packed), inJournal);
    const saved = fresh.filter((i) => i.kind === "saved");
    const review = fresh.filter((i) => i.kind === "review");

    if (saved.length > 0) {
      add(saved.map((i) => i.transaction));
      // Told to the server the way a capture made on screen is, per capture.
      const byCapture = new Map<string | null, typeof saved>();
      for (const item of saved) {
        byCapture.set(item.captureId, [...(byCapture.get(item.captureId) ?? []), item]);
      }
      byCapture.forEach((items, captureId) =>
        reportTransactions(items.map((i) => i.transaction), captureId),
      );
    }
    holdForReview(review);

    const parts = [
      saved.length > 0 ? `${saved.length} logged from your widget` : null,
      review.length > 0 ? `${review.length} to check` : null,
    ].filter(Boolean);
    if (parts.length > 0) {
      // A one-line notice, deliberately set from the effect: it is the
      // response to an address that was only readable once the page was up.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLine(parts.join(" · "));
    }
  }, [add]);

  useEffect(() => {
    if (!line) return;
    const t = window.setTimeout(() => setLine(null), 6000);
    return () => window.clearTimeout(t);
  }, [line]);

  if (!line) return null;
  return (
    <p
      role="status"
      className="rise fixed inset-x-5 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 mx-auto w-fit max-w-[420px] rounded-[var(--radius-pill)] border-2 border-vast-ink bg-mint-whisper px-5 py-2 text-center font-figtree text-body-sm font-medium text-vast-ink"
    >
      {line}
    </p>
  );
}

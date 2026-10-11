"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppHeader } from "@/components/AppHeader";
import { CapturePanel } from "@/components/CapturePanel";
import { FirstExpenseGuide } from "@/components/FirstExpenseGuide";
import { TransactionDetail } from "@/components/TransactionDetail";
import { TransactionList } from "@/components/TransactionList";
import { prewarm } from "@/lib/prewarm";
import { useAutoRecord } from "@/lib/useAutoRecord";
import { useCapture } from "@/lib/useCapture";
import { changedFields, reportDelete, reportEvent, reportTransactions } from "@/lib/report";
import { useToday } from "@/lib/useToday";
import { useTransactions } from "@/lib/useTransactions";
import {
  clearReviews,
  markSeen,
  reviewServerSnapshot,
  reviewSnapshot,
  subscribeReviews,
} from "@/lib/widgetInbox";
import type { Transaction } from "@/lib/types";

export default function Home() {
  const { transactions, add, update, remove, undo } = useTransactions();
  const [open, setOpen] = useState<Transaction | null>(null);
  // True when the row was opened from the "Logged" confirmation, which is
  // only ever done to correct it.
  const [fixing, setFixing] = useState(false);

  // No captureDate: this screen records onto today, which is also the
  // extractor's own default. The journal is the only caller that overrides it.
  const captured = useCapture({ onLogged: add, onUndo: undo });

  // Opened from a shortcut (`/app?record=1`): start listening without a tap
  // where the phone allows it. Where it does not, say to tap, in plain words,
  // instead of the permission error that would be the wrong diagnosis.
  const auto = useAutoRecord({
    state: captured.state,
    error: captured.error,
    start: captured.start,
  });
  const capture = {
    ...captured,
    start: auto.startByTap,
    error: auto.blocked ? null : captured.error,
  };

  // Wake the server's capture functions now, while the person is looking at the screen, rather than
  // on the first thing they say. Again when the app comes back from the background, where it will
  // have been idle long enough for them to have stopped. See prewarm.ts.
  useEffect(() => {
    prewarm();
    const onShow = () => {
      if (document.visibilityState === "visible") prewarm();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);

  // Reviews the Android widget could not decide on arrive as review cards,
  // exactly as if the app had been unsure on screen.
  const widgetReviews = useSyncExternalStore(subscribeReviews, reviewSnapshot, reviewServerSnapshot);
  const { adopt } = captured;
  useEffect(() => {
    if (widgetReviews.length === 0) return;
    adopt(
      widgetReviews.map((item) => ({
        transaction: item.transaction,
        needsConfirmation: item.needsConfirmation,
        confirmationReason: item.reason,
        captureId: item.captureId,
      })),
    );
    markSeen(widgetReviews.map((item) => item.transaction.id));
    clearReviews();
  }, [widgetReviews, adopt]);

  /**
   * This screen is today, and only today.
   *
   * An expense dated to an earlier day (corrected in the journal, or spoken
   * onto another date) belongs to that day's record, not to the running list
   * of what today has cost. Showing it here made the day's total read as
   * something it wasn't. The journal is where every day lives.
   */
  const today = useToday();
  const todays = useMemo(
    () => transactions.filter((t) => t.date.value === today),
    [transactions, today],
  );

  // Keep the open transaction in step with edits, same reason the journal
  // does this: the detail view must never show a stale copy of a record it
  // just changed.
  const openLive = useMemo(
    () => (open ? transactions.find((t) => t.id === open.id) ?? null : null),
    [open, transactions],
  );

  const { forget } = capture;
  const handleDelete = useCallback(
    (id: string) => {
      const before = transactions.find((t) => t.id === id) ?? null;
      reportEvent("deleted", { transactionId: id, before });
      reportDelete(id);
      remove(id);
      forget(id);
      setOpen(null);
    },
    [transactions, remove, forget],
  );

  return (
    <main className="enter-children mx-auto flex w-full max-w-[900px] flex-col gap-16 px-5 pb-36 pt-8 sm:gap-24 sm:px-8 sm:pt-12">
      <AppHeader profile />
      <h1 className="sr-only">Capture an expense</h1>

      {/* After the welcome tour only: help with the first expense, then one
          suggestion. Renders nothing for everyone else. */}

      <FirstExpenseGuide capture={capture} entries={transactions.length} />


      {/* No headline here on purpose. This is the screen someone opens to
          log ₹250 at a shop counter, not the one that introduces the
          product; that job belongs to the landing page now (`/`). The
          record button is the first thing, every time. */}
      <CapturePanel
        capture={capture}
        notice={
          auto.blocked
            ? "Tap the button to start speaking. Your phone asks for a tap before it opens the microphone."
            : null
        }
        scrollToPending
        onEdit={(t) => {
          setFixing(true);
          setOpen(t);
        }}
      />

      <TransactionList
        transactions={todays}
        onOpen={(t) => {
          setFixing(false);
          setOpen(t);
        }}
      />

      {openLive ? (
        <TransactionDetail
          transaction={openLive}
          backLabel="Capture"
          startEditing={fixing}
          onClose={() => setOpen(null)}
          onSave={(next) => {
            reportEvent("edited", {
              transactionId: next.id,
              before: openLive,
              after: next,
              changedFields: changedFields(openLive, next),
            });
            reportTransactions([next]);
            update(next);
            capture.amend(next);
            setOpen(null);
          }}
          onDelete={handleDelete}
        />
      ) : null}
    </main>
  );
}

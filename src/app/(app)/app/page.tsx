"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { CapturePanel } from "@/components/CapturePanel";
import { TransactionDetail } from "@/components/TransactionDetail";
import { TransactionList } from "@/components/TransactionList";
import { currentSession } from "@/lib/auth";
import { useCapture } from "@/lib/useCapture";
import { changedFields, reportDelete, reportEvent, reportTransactions } from "@/lib/report";
import { todayISO } from "@/lib/journal";
import { useTransactions } from "@/lib/useTransactions";
import type { Transaction } from "@/lib/types";

export default function Home() {
  const { transactions, add, update, remove, undo } = useTransactions();
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState<Transaction | null>(null);
  // True when the row was opened from the "Logged" confirmation, which is
  // only ever done to correct it.
  const [fixing, setFixing] = useState(false);

  // Read after mount, same reason as the transaction hydration in
  // TransactionsProvider: a stub session lives in localStorage, which
  // doesn't exist on the server.
  useEffect(() => {
    setSignedIn(currentSession() !== null);
  }, []);

  // No captureDate: this screen records onto today, which is also the
  // extractor's own default. The journal is the only caller that overrides it.
  const capture = useCapture({ onLogged: add, onUndo: undo });

  /**
   * This screen is today, and only today.
   *
   * An expense dated to an earlier day (corrected in the journal, or spoken
   * onto another date) belongs to that day's record, not to the running list
   * of what today has cost. Showing it here made the day's total read as
   * something it wasn't. The journal is where every day lives.
   */
  const today = todayISO();
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
    <main className="mx-auto flex w-full max-w-[900px] flex-col gap-16 px-5 pb-36 pt-8 sm:gap-24 sm:px-8 sm:pt-12">
      <AppHeader signedIn={signedIn} />

      {/* No headline here on purpose. This is the screen someone opens to
          log ₹250 at a shop counter, not the one that introduces the
          product; that job belongs to the landing page now (`/`). The
          record button is the first thing, every time. */}
      <CapturePanel
        capture={capture}
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

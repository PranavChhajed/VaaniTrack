"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ReviewCard } from "@/components/ReviewCard";
import { TransactionList } from "@/components/TransactionList";
import { WaveformButton } from "@/components/WaveformButton";
import { currentSession } from "@/lib/auth";
import { useCapture } from "@/lib/useCapture";
import { reportDelete, reportEvent } from "@/lib/report";
import { todayISO } from "@/lib/journal";
import {
  loadTransactions,
  saveTransactions,
  type Transaction,
} from "@/lib/types";

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const reviewRef = useRef<HTMLElement | null>(null);

  // Read after mount, same reason as the transaction hydration below: a
  // stub session lives in localStorage, which doesn't exist on the server.
  useEffect(() => {
    setSignedIn(currentSession() !== null);
  }, []);

  const handleLogged = useCallback((saved: Transaction[]) => {
    setTransactions((prev) => [...saved, ...prev]);
  }, []);

  const handleUndo = useCallback((ids: string[]) => {
    const drop = new Set(ids);
    setTransactions((prev) => prev.filter((t) => !drop.has(t.id)));
  }, []);

  // No captureDate: this screen records onto today, which is also the
  // extractor's own default. The journal is the only caller that overrides it.
  const capture = useCapture({ onLogged: handleLogged, onUndo: handleUndo });

  // On a phone the hero fills the screen, so a review card rendered below it
  // is invisible — you tap, something appears off-screen, and the app looks
  // broken. Bring it into view the moment it exists.
  useEffect(() => {
    if (capture.pending.length > 0) {
      reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [capture.pending.length]);

  useEffect(() => {
    setTransactions(loadTransactions());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveTransactions(transactions);
  }, [transactions, hydrated]);

  /**
   * This screen is today, and only today.
   *
   * An expense dated to an earlier day — corrected in the journal, or spoken
   * onto another date — belongs to that day's record, not to the running list
   * of what today has cost. Showing it here made the day's total read as
   * something it wasn't. The journal is where every day lives.
   */
  const today = todayISO();
  const todays = useMemo(
    () => transactions.filter((t) => t.date.value === today),
    [transactions, today],
  );

  return (
    <main className="mx-auto flex w-full max-w-[900px] flex-col gap-16 px-5 py-8 sm:gap-24 sm:px-8 sm:py-12">
      <header className="flex items-center justify-between rounded-[var(--radius-pill)] border-2 border-vast-ink bg-paper-raised px-6 py-4">
        <span className="flex items-center gap-3">
          <Logo size={24} />
          <span className="font-figtree text-body-sm font-semibold tracking-tight">
            VaaniTrack
          </span>
        </span>
        <span className="flex items-center gap-4">
          {/* Only when signed out — there's nowhere for a signed-in link to
              go yet (no settings screen), so showing one would promise a
              destination that doesn't exist. */}
          {!signedIn && (
            <Link
              href="/signin"
              className="font-figtree text-body-sm text-fog underline underline-offset-4 hover:text-vast-ink"
            >
              Sign in
            </Link>
          )}
          {/* Quiet on purpose. Speaking is the app; the journal is where what
              you said ends up. The easier way in is the link under Today's
              list, which sits within thumb reach. */}
          <Link
            href="/journal"
            className="font-figtree text-body-sm text-charcoal underline underline-offset-4 hover:text-vast-ink"
          >
            Journal &rsaquo;
          </Link>
        </span>
      </header>

      <section className="flex flex-col items-start">
        <h1 className="display-type max-w-[14ch] text-heading text-vast-ink sm:text-heading-lg">
          Say what you spent.
          <span className="text-fog"> Check it. Done.</span>
        </h1>
        <p className="mt-6 max-w-[52ch] font-figtree text-body text-charcoal">
          Speak the way you&rsquo;d text yourself &mdash; &ldquo;250 lunch&rdquo;.
          Clear ones are logged straight away. Anything uncertain gets checked
          with you first.
        </p>

        <div className="mt-10 w-full">
          <WaveformButton
            state={capture.state}
            level={capture.level}
            busy={capture.busy}
            onStart={capture.start}
            onStop={capture.stop}
          />
        </div>

        {/* Typing the same thing you'd say. The behaviour the product was
            modelled on, and the reason a refused mic isn't a dead end. */}
        <form
          className="mt-4 flex w-full max-w-[340px] items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void capture.submitTyped();
          }}
        >
          <input
            value={capture.typed}
            onChange={(e) => capture.setTyped(e.target.value)}
            placeholder="…or type it: 250 lunch"
            aria-label="Type an expense"
            enterKeyHint="done"
            className="min-w-0 flex-1 rounded-[12px] border-2 border-vast-ink bg-paper-raised px-4 py-3 font-figtree text-body-sm text-vast-ink outline-none placeholder:text-fog focus:border-forest-ink"
          />
          <button
            type="submit"
            disabled={!capture.typed.trim() || capture.busy}
            className={[
              "shrink-0 rounded-[12px] border-2 border-vast-ink px-5 py-3",
              "font-figtree text-body-sm font-medium text-vast-ink",
              !capture.typed.trim() || capture.busy
                ? "cursor-not-allowed bg-paper-edge opacity-60"
                : "bg-mint-whisper active:bg-mint-deep",
            ].join(" ")}
          >
            Add
          </button>
        </form>

        {capture.error ? (
          <p className="mt-6 max-w-[60ch] rounded-[12px] border-2 border-vast-ink bg-ember-glow px-4 py-3 font-figtree text-body-sm text-vast-ink">
            {capture.error}
          </p>
        ) : null}

        {/* Auto-logged entries announce themselves and stay undoable. Saving
            without asking is only acceptable if reversing it is trivial. */}
        {capture.justSaved && capture.justSaved.length > 0 ? (
          <div className="rise mt-6 flex w-full max-w-[340px] flex-wrap items-center justify-between gap-3 rounded-[12px] border-2 border-vast-ink bg-mint-whisper px-4 py-3">
            <span className="font-figtree text-body-sm text-vast-ink">
              Logged{" "}
              {capture.justSaved.map((t, i) => (
                <span key={t.id}>
                  {i > 0 ? " · " : ""}
                  <span className="money">₹{t.amount.value}</span>{" "}
                  {t.description.value ?? ""}
                </span>
              ))}
            </span>
            <button
              type="button"
              onClick={capture.undo}
              className="font-figtree text-body-sm font-medium text-vast-ink underline underline-offset-4"
            >
              Undo
            </button>
          </div>
        ) : null}

        {/* There is no console on a phone. This line is how a failure becomes
            diagnosable instead of just "it doesn't work". */}
        {capture.debug ? (
          <p className="mt-3 max-w-[60ch] break-words font-figtree text-caption text-fog">
            {capture.debug}
          </p>
        ) : null}
      </section>

      {capture.pending.length > 0 ? (
        <section ref={reviewRef} className="flex flex-col gap-6 scroll-mt-4">
          <h2 className="display-type text-heading-sm text-vast-ink">
            {capture.pending.length === 1
              ? "Check this before it’s saved"
              : `Check these ${capture.pending.length} before they’re saved`}
          </h2>
          {capture.pending.map((item, index) => (
            <ReviewCard
              key={item.transaction.id}
              transaction={item.transaction}
              needsConfirmation={item.needsConfirmation}
              confirmationReason={item.confirmationReason}
              onSave={(t) => capture.commit(index, t)}
              onDiscard={() => capture.discard(index)}
            />
          ))}
        </section>
      ) : null}

      <TransactionList
        transactions={todays}
        onDelete={(id) => {
          const before = transactions.find((t) => t.id === id) ?? null;
          reportEvent("deleted", { transactionId: id, before });
          reportDelete(id);
          setTransactions((prev) => prev.filter((t) => t.id !== id));
        }}
      />
    </main>
  );
}

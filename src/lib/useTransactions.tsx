"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { deleteTransaction, updateTransaction } from "@/lib/journal";
import { readLocal } from "@/lib/localStore";
import { useLocalValue } from "@/lib/useLocalValue";
import {
  TRANSACTIONS_KEY,
  loadTransactions,
  parseTransactions,
  saveTransactions,
  type Transaction,
} from "@/lib/types";

type TransactionsContextValue = {
  transactions: Transaction[];
  /** False until the journal has been read from the phone. Whatever "loading"
   *  state a screen wants to show hangs off this, so a screen never renders
   *  an empty journal as if it were one. */
  hydrated: boolean;
  /** Prepend freshly captured rows. */
  add: (saved: Transaction[]) => void;
  /** Replace one row in place, by id. */
  update: (next: Transaction) => void;
  /** Remove one row, by id. */
  remove: (id: string) => void;
  /** Drop rows that were just auto-saved, by id. */
  undo: (ids: string[]) => void;
};

const TransactionsContext = createContext<TransactionsContextValue | null>(
  null,
);

const NONE: Transaction[] = [];

/**
 * One journal, mounted once in `(app)/layout.tsx`.
 *
 * The journal lives in browser storage and this provider is a window onto it,
 * not a copy of it. Every change reads the journal as it is *now*, applies
 * itself, and writes it back, so there is no in-memory list that can fall
 * behind what is stored, and no second writer that can overwrite it with a
 * stale one. That is what the old hydrate-then-save-on-change effect needed a
 * guard against, and the guard (never save an empty journal over a full one)
 * is what made deleting your last remaining entry silently come back on the
 * next reload.
 *
 * Storage is the source of truth, so a change made in another tab arrives
 * here too.
 */
export function TransactionsProvider({ children }: { children: ReactNode }) {
  // The raw text is the snapshot: it is a string, so React can tell whether
  // it changed. Parsed once per change below.
  const raw = useLocalValue<string | null | undefined>(
    () => readLocal(TRANSACTIONS_KEY),
    undefined,
  );
  const hydrated = raw !== undefined;
  const transactions = useMemo(
    () => (raw ? parseTransactions(raw) : NONE),
    [raw],
  );

  const add = useCallback((saved: Transaction[]) => {
    saveTransactions([...saved, ...loadTransactions()]);
  }, []);

  const update = useCallback((next: Transaction) => {
    saveTransactions(updateTransaction(loadTransactions(), next.id, next));
  }, []);

  const remove = useCallback((id: string) => {
    saveTransactions(deleteTransaction(loadTransactions(), id));
  }, []);

  const undo = useCallback((ids: string[]) => {
    const drop = new Set(ids);
    saveTransactions(loadTransactions().filter((t) => !drop.has(t.id)));
  }, []);

  const value = useMemo(
    () => ({ transactions, hydrated, add, update, remove, undo }),
    [transactions, hydrated, add, update, remove, undo],
  );

  return (
    <TransactionsContext.Provider value={value}>
      {children}
    </TransactionsContext.Provider>
  );
}

export function useTransactions(): TransactionsContextValue {
  const ctx = useContext(TransactionsContext);
  if (!ctx) {
    throw new Error("useTransactions must be used within TransactionsProvider");
  }
  return ctx;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { deleteTransaction, updateTransaction } from "@/lib/journal";
import { loadTransactions, saveTransactions, type Transaction } from "@/lib/types";

type TransactionsContextValue = {
  transactions: Transaction[];
  /** False until the first read from localStorage completes. Gates the
   *  save effect below, and whatever "loading" state a screen wants to
   *  show, so a screen never renders an empty journal as if it were one. */
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

/**
 * One journal, one save effect, mounted once in `(app)/layout.tsx`.
 *
 * `(app)/app/page.tsx` and `(app)/journal/page.tsx` previously each held
 * their own copy of this state and their own save effect against the same
 * `vaanitrack.transactions` key: navigating between them re-hydrated from
 * scratch, and unmount ordering decided whose write landed last. Lifting it
 * here removes that race rather than papering over it.
 */
export function TransactionsProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setTransactions(loadTransactions());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveTransactions(transactions);
  }, [transactions, hydrated]);

  const add = useCallback((saved: Transaction[]) => {
    setTransactions((prev) => [...saved, ...prev]);
  }, []);

  const update = useCallback((next: Transaction) => {
    setTransactions((prev) => updateTransaction(prev, next.id, next));
  }, []);

  const remove = useCallback((id: string) => {
    setTransactions((prev) => deleteTransaction(prev, id));
  }, []);

  const undo = useCallback((ids: string[]) => {
    const drop = new Set(ids);
    setTransactions((prev) => prev.filter((t) => !drop.has(t.id)));
  }, []);

  return (
    <TransactionsContext.Provider
      value={{ transactions, hydrated, add, update, remove, undo }}
    >
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

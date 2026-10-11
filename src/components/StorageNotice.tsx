"use client";

import Link from "next/link";
import { useState } from "react";
import { storageRefused } from "@/lib/localStore";
import { useLocalValue } from "@/lib/useLocalValue";

/**
 * Says so when the phone will not keep what is being written.
 *
 * Storage that is full, or blocked (a private tab), makes the journal fall back to memory: the app
 * carries on, the new expense is on screen, and it is gone when the app closes. That is the one
 * way this app can lose a person's entry without telling them, so it tells them: once, plainly,
 * with the way out (the You screen exports the journal). Dismissable, because in a private tab it
 * will not stop being true and nagging would help nobody.
 *
 * Border and text on raised paper, never a fill, like every other error in this system.
 */
export function StorageNotice() {
  const refused = useLocalValue(storageRefused, false);
  const [dismissed, setDismissed] = useState(false);
  if (!refused || dismissed) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[45] mx-auto w-[calc(100%-2.5rem)] max-w-[420px] rounded-[var(--radius-input)] border-2 border-alert bg-paper-raised px-4 py-3 font-figtree text-body-sm text-alert"
    >
      <p>
        This phone isn&rsquo;t keeping new entries (its storage is full or blocked), so they may be
        lost when the app closes.
      </p>
      <div className="mt-1 flex items-center gap-4">
        <Link href="/you" className="focus-ring -my-2 inline-block py-3 underline underline-offset-4">
          Export your journal
        </Link>
        <button type="button" onClick={() => setDismissed(true)} className="focus-ring -my-2 py-3 underline underline-offset-4">
          Got it
        </button>
      </div>
    </div>
  );
}

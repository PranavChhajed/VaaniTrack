"use client";
import { useEffect, useState } from "react";
import { activeAccount, cacheKey, queueJournal, readCache, resolveConflict, syncAccount, visibleRows, writeCache } from "@/lib/account/local";
import { readLocal } from "@/lib/localStore";
import { parseTransactions, TRANSACTIONS_KEY } from "@/lib/types";
import { useLocalValue } from "@/lib/useLocalValue";
import { WhatsAppLink } from "@/components/WhatsAppLink";

export function AccountSync() {
  const id = useLocalValue(() => activeAccount()?.id ?? null, null);
  const raw = useLocalValue(() => id ? readLocal(cacheKey(id)) : null, null);
  const [status, setStatus] = useState("Changes stay on this device until synced");
  useEffect(() => {
    if (!id) return;
    let alive = true, running = false;
    const sync = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try { await syncAccount(id); if (alive) setStatus("Synced"); }
      catch (error) { if (alive) setStatus(error instanceof Error ? error.message : "Sync paused"); }
      finally { running = false; }
    };
    void sync();
    const interval = setInterval(sync, 15000);
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", sync);
    return () => { alive = false; clearInterval(interval); window.removeEventListener("online", sync); document.removeEventListener("visibilitychange", sync); };
  }, [id]);
  // Wake after writes without creating a read -> sync -> read feedback loop.
  const pendingCount = id && raw ? readCache(id).pending.length : 0;
  useEffect(() => {
    if (!id || !pendingCount) return;
    const timer = setTimeout(() => { void syncAccount(id).catch(() => {}); }, 500);
    return () => clearTimeout(timer);
  }, [id, pendingCount]);
  if (!id) return null;
  const cache = readCache(id);
  const guest = parseTransactions(readLocal(TRANSACTIONS_KEY)).filter(row => !cache.importedIds?.includes(row.id));
  return <aside className="mx-auto max-w-xl border-b border-paper-edge p-3 text-sm" aria-label="Account sync">
    <p role="status">{pendingCount ? `${pendingCount} changes waiting to sync` : status}</p>
    {guest.length > 0 && <div className="mt-2">
      <p>{guest.length} expenses are still in this device’s local journal.</p>
      <button className="underline p-2" onClick={() => {
        const existing = visibleRows(readCache(id));
        const known = new Set(existing.map(row => row.id));
        queueJournal(id, [...existing, ...guest.filter(row => !known.has(row.id))]);
        const latest = readCache(id);
        writeCache(id, { ...latest, importedIds: [...new Set([...(latest.importedIds ?? []), ...guest.map(row => row.id)])] });
      }}>Import {guest.length} expenses into this account</button>
      <button className="underline p-2" onClick={() => writeCache(id, { ...cache, importedIds: [...new Set([...(cache.importedIds ?? []), ...guest.map(row => row.id)])] })}>Keep them local</button>
    </div>}
    {Object.entries(cache.conflicts).map(([rowId, remote]) => {
      const local = visibleRows(cache).find(row => row.id === rowId);
      return <div key={rowId} className="mt-3 rounded border p-3">
        <p>This expense changed on another device.</p>
        <p>Here: {local ? `${local.amount.value ?? "?"} · ${local.description.value ?? "Expense"}` : "Deleted"}</p>
        <p>Cloud: {remote?.data && !remote.deleted ? `${remote.data.amount.value ?? "?"} · ${remote.data.description.value ?? "Expense"}` : "Deleted"}</p>
        <button className="underline p-2" onClick={() => resolveConflict(id, rowId, false)}>Use cloud version</button>
        <button className="underline p-2" onClick={() => resolveConflict(id, rowId, true)}>Keep my version</button>
      </div>;
    })}
    <WhatsAppLink accountId={id} />
  </aside>;
}

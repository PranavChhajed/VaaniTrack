import { readLocal, writeLocal, removeLocal } from "../localStore";
import type { Transaction } from "../types";

export type Account = { id: string; email: string };
export type Row = { id: string; revision: number; data: Transaction | null; deleted: boolean };
export type Operation = { operationId: string; id: string; baseRevision: number; data: Transaction | null; deleted: boolean };
export type Cache = { rows: Row[]; pending: Operation[]; conflicts: Record<string, Row | null>; importedIds?: string[] };
const ACTIVE = "vaanitrack.account.active";
export function activeAccount(): Account | null {
  try { const a = JSON.parse(readLocal(ACTIVE) ?? "null"); return a?.id && a?.email ? a : null; } catch { return null; }
}
export function selectAccount(account: Account | null) {
  if (account) writeLocal(ACTIVE, JSON.stringify(account)); else removeLocal(ACTIVE);
}
export const cacheKey = (id: string) => `vaanitrack.account.${id}.journal`;
export function readCache(id: string): Cache {
  const raw = readLocal(cacheKey(id));
  if (!raw) return { rows: [], pending: [], conflicts: {} };
  const cache = JSON.parse(raw) as Cache;
  if (!Array.isArray(cache.rows) || !Array.isArray(cache.pending) || !cache.conflicts) throw new Error("Account journal needs recovery");
  return cache;
}
export function writeCache(id: string, cache: Cache) { writeLocal(cacheKey(id), JSON.stringify(cache)); }
export function visibleRows(cache: Cache): Transaction[] {
  const rows = new Map(cache.rows.filter(row => !row.deleted && row.data).map(row => [row.id, row.data!]));
  for (const operation of cache.pending) {
    if (operation.deleted) rows.delete(operation.id); else if (operation.data) rows.set(operation.id, operation.data);
  }
  return [...rows.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function queueJournal(id: string, next: Transaction[]) {
  const cache = readCache(id);
  const previous = new Map(visibleRows(cache).map(row => [row.id, row]));
  const upcoming = new Map(next.map(row => [row.id, row]));
  for (const rowId of new Set([...previous.keys(), ...upcoming.keys()])) {
    const before = previous.get(rowId), after = upcoming.get(rowId);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    const base = cache.rows.find(row => row.id === rowId)?.revision ?? 0;
    cache.pending.push({ operationId: crypto.randomUUID(), id: rowId,
      baseRevision: base + cache.pending.filter(op => op.id === rowId).length,
      data: after ?? null, deleted: !after });
  }
  writeCache(id, cache);
}

export function resolveConflict(accountId: string, id: string, keepLocal: boolean) {
  const cache = readCache(accountId);
  if (!(id in cache.conflicts)) return;
  const desired = visibleRows(cache).find(row => row.id === id) ?? null;
  const current = cache.conflicts[id];
  cache.pending = cache.pending.filter(op => op.id !== id);
  cache.rows = cache.rows.filter(row => row.id !== id);
  if (current) cache.rows.push(current);
  delete cache.conflicts[id];
  if (keepLocal) cache.pending.push({ operationId: crypto.randomUUID(), id,
    baseRevision: current?.revision ?? 0, data: desired, deleted: !desired });
  writeCache(accountId, cache);
}

async function verifiedSession(id: string) {
  let response = await fetch("/api/account/session", { cache: "no-store" });
  if (response.status === 401) response = await fetch("/api/account/session", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh" }) });
  if (!response.ok || (await response.json()).account?.id !== id) throw new Error("Sign in again to sync this account");
}

export async function syncAccount(id: string) {
  const run = async () => {
    await verifiedSession(id);
    while (activeAccount()?.id === id) {
      const snapshot = readCache(id);
      const next = snapshot.pending.find(op => !(op.id in snapshot.conflicts));
      if (!next) break;
      const response = await fetch("/api/account/journal", { method: "POST", headers: { "Content-Type": "application/json", "X-Vaani-Account": id }, body: JSON.stringify(next) });
      const result = await response.json();
      if (response.status !== 409 && !response.ok) throw new Error(result.error ?? "Sync paused");
      const cache = readCache(id);
      if (result.conflict === true) cache.conflicts[next.id] = result.current;
      else {
        if (!result.row) throw new Error(result.error ?? "Sync paused");
        cache.rows = [...cache.rows.filter(row => row.id !== next.id), result.row];
        cache.pending = cache.pending.filter(op => op.operationId !== next.operationId);
      }
      writeCache(id, cache);
    }
    if (activeAccount()?.id !== id) return;
    const response = await fetch("/api/account/journal", { cache: "no-store", headers: { "X-Vaani-Account": id } });
    if (!response.ok) throw new Error("Sync paused; changes remain on this device");
    const result = await response.json();
    const cache = readCache(id);
    cache.rows = result.rows;
    writeCache(id, cache);
  };
  if (!navigator.locks) throw new Error("This browser cannot safely sync. Your changes remain on this device.");
  return navigator.locks.request(`vaani-sync-${id}`, run);
}

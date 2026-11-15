import assert from "node:assert/strict";
import { activeAccount, queueJournal, readCache, resolveConflict, selectAccount, visibleRows, writeCache, syncAccount } from "../src/lib/account/local";
import { loadTransactions, saveTransactions, TRANSACTIONS_KEY, sanitizeTransaction } from "../src/lib/types";

const storage = new Map<string, string>();
Object.assign(globalThis, { window: { localStorage: { getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } } });
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: { request: (_: string, callback: () => unknown) => callback() } } });
const expense = sanitizeTransaction({ id: "expense", amount: { value: 250, provenance: "said" }, description: { value: "Lunch", provenance: "said" } }, 0)!;
let checks = 0;
function check(value: unknown) { assert.ok(value); checks++; }
async function main() {
  saveTransactions([expense]);
  const guestCopy = storage.get(TRANSACTIONS_KEY);
  selectAccount({ id: "a", email: "a@example.test" });
  check(loadTransactions().length === 0);
  saveTransactions([expense]);
  check(readCache("a").pending.length === 1);
  check(storage.get(TRANSACTIONS_KEY) === guestCopy);
  saveTransactions([{ ...expense, description: { value: "Dinner", provenance: "said" } }]);
  check(readCache("a").pending[1].baseRevision === 1);
  selectAccount({ id: "b", email: "b@example.test" });
  check(loadTransactions().length === 0);
  selectAccount(null);
  check(loadTransactions()[0].description.value === "Lunch");
  selectAccount({ id: "a", email: "a@example.test" });
  check(loadTransactions()[0].description.value === "Dinner");
  writeCache("a", { ...readCache("a"), conflicts: { expense: { id: "expense", revision: 4, data: expense, deleted: false } } });
  resolveConflict("a", "expense", true);
  check(readCache("a").pending.length === 1 && readCache("a").pending[0].baseRevision === 4);
  const pending = JSON.stringify(readCache("a").pending);
  globalThis.fetch = async () => { throw new Error("offline"); };
  await assert.rejects(syncAccount("a")); checks++;
  check(JSON.stringify(readCache("a").pending) === pending);
  let posts = 0;
  globalThis.fetch = async () => Response.json({ account: { id: "b" } });
  await assert.rejects(syncAccount("a")); checks++;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("session")) return Response.json({ account: { id: "a" } });
    check((init?.headers as Record<string, string>)["X-Vaani-Account"] === "a");
    if (init?.method === "POST") {
      posts++;
      return Response.json({ conflict: false, row: { id: "expense", revision: 5, data: expense, deleted: false } });
    }
    return Response.json({ rows: [{ id: "expense", revision: 5, data: expense, deleted: false }] });
  };
  await syncAccount("a");
  check(posts === 1 && readCache("a").pending.length === 0);
  queueJournal("a", []);
  check(readCache("a").pending[0].deleted && visibleRows(readCache("a")).length === 0);
  writeCache("a", { ...readCache("a"), conflicts: { expense: { id: "expense", revision: 6, data: expense, deleted: false } } });
  resolveConflict("a", "expense", false);
  check(visibleRows(readCache("a")).length === 1 && readCache("a").pending.length === 0);
  check(activeAccount()?.id === "a");
  console.log(`Account cache: ${checks} checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { mutateJournal, readJournal, validateMutation } from "../src/lib/account/journal";

// Explicit isolated database only. Never load .env.local or use DATABASE_URL.
const url = process.env.ACCOUNT_TEST_DATABASE_URL;
if (!url || !/^postgres:\/\/vt_test@(?:localhost|127\.0\.0\.1):55439\/vt_test$/.test(url)) {
  throw new Error("Use the isolated localhost:55439/vt_test database");
}
const db = postgres(url, { max: 6 });
let count = 0;
function check(value: unknown) { assert.ok(value); count++; }
const a = randomUUID(), b = randomUUID();
const expense = (id: string, amount = 250) => ({ id, amount: { value: amount, provenance: "said" },
  description: { value: "Lunch", provenance: "said" }, createdAt: "2026-11-15T10:00:00Z", source: "manual" });
const change = (id: string, baseRevision = 0, amount = 250) => ({ operationId: randomUUID(), id, baseRevision, deleted: false, data: expense(id, amount) });
async function main() {
try {
  const [exists] = await db`select to_regclass('account_private.journal') as found`;
  if (!exists.found) {
    const migration = postgres(url!, { max: 1 });
    try { await migration.unsafe(await readFile("supabase/006_accounts.sql", "utf8")); }
    finally { await migration.end(); }
  }
  const original = change("lunch");
  const saved = await mutateJournal(db, a, original);
  check(saved.row.revision === 1);
  assert.deepEqual(await mutateJournal(db, a, original), saved); count++;
  await assert.rejects(mutateJournal(db, a, { ...original, data: expense("lunch", 999) })); count++;
  check((await readJournal(db, b)).length === 0);
  check((await mutateJournal(db, b, change("lunch", 0, 50))).row.data.amount.value === 50);
  const concurrent = await Promise.all([mutateJournal(db, a, change("lunch", 1, 300)), mutateJournal(db, a, change("lunch", 1, 400))]);
  check(concurrent.filter(result => result.conflict).length === 1);
  check(concurrent.filter(result => !result.conflict).length === 1);
  const removed = await mutateJournal(db, a, { ...change("lunch", 2), deleted: true });
  check(removed.row.deleted && removed.row.revision === 3);
  check((await mutateJournal(db, a, change("lunch", 0))).conflict);
  check((await readJournal(db, a))[0].deleted);
  const retry = change("retry");
  const retries = await Promise.all(Array.from({ length: 8 }, () => mutateJournal(db, a, retry)));
  check(retries.every(result => result.row.revision === 1));
  for (const bad of [null, {}, { ...change("x"), baseRevision: -1 }, { ...change("x"), operationId: "device-id" },
    { ...change("x"), data: expense("different") }, { ...change("x"), deleted: "false" }]) {
    assert.throws(() => validateMutation(bad)); count++;
  }
  // Exercise RLS as a non-superuser: SQL tests above also use explicit ownership filters.
  await db.unsafe("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='vt_rls_test') THEN CREATE ROLE vt_rls_test; END IF; END $$");
  await db.unsafe("GRANT USAGE ON SCHEMA account_private TO vt_rls_test; GRANT SELECT,INSERT,UPDATE ON account_private.journal TO vt_rls_test");
  await db.begin(async tx => {
    await tx.unsafe("SET LOCAL ROLE vt_rls_test");
    check((await tx`select * from account_private.journal`).length === 0);
    await tx`select set_config('vaani.account_id',${a},true)`;
    const rows = await tx`select * from account_private.journal`;
    check(rows.length === 2 && rows.every(row => row.account_id === a));
  });
  console.log(`Account journal: ${count} checks passed (isolated PostgreSQL)`);
} finally {
  await db`delete from account_private.operations where account_id in (${a},${b})`;
  await db`delete from account_private.journal where account_id in (${a},${b})`;
  await db.end();
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });

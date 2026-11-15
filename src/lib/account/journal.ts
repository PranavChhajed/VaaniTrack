import { createHash } from "node:crypto";
import type postgres from "postgres";
import { sanitizeTransaction } from "../types";
import { AccountError } from "./server";

export type Mutation = { operationId: string; id: string; baseRevision: number; data: unknown; deleted: boolean };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateMutation(input: unknown): Mutation {
  if (!input || typeof input !== "object") throw new AccountError(400, "Invalid change");
  const m = input as Mutation;
  if (!UUID.test(m.operationId) || typeof m.id !== "string" || !m.id.length || m.id.length > 200 ||
      !Number.isSafeInteger(m.baseRevision) || m.baseRevision < 0 || typeof m.deleted !== "boolean") {
    throw new AccountError(400, "Invalid change");
  }
  const data = m.deleted ? null : sanitizeTransaction(m.data, 0);
  if (!m.deleted && (!data || data.id !== m.id || JSON.stringify(data).length > 16000)) {
    throw new AccountError(400, "Invalid expense");
  }
  return { operationId: m.operationId, id: m.id, baseRevision: m.baseRevision, deleted: m.deleted, data };
}

export async function readJournal(db: postgres.Sql, accountId: string) {
  return db.begin(async tx => {
    await tx`select set_config('vaani.account_id', ${accountId}, true)`;
    return tx`select id, revision::integer, data, deleted, channel from account_private.journal
      where account_id=${accountId} order by updated_at,id`;
  });
}

/** Serialize all writes for an account, including create-vs-create and retries.
 * The idempotency receipt commits atomically with its row. Tombstones never vanish. */
export async function mutateJournal(db: postgres.Sql, accountId: string, input: unknown, channel = "app") {
  const m = validateMutation(input);
  const hash = createHash("sha256").update(JSON.stringify(m)).digest("hex");
  return db.begin(async tx => {
    await tx`select set_config('vaani.account_id', ${accountId}, true)`;
    await tx`select pg_advisory_xact_lock(hashtextextended(${accountId},0))`;
    const [receipt] = await tx`select request_hash,result from account_private.operations
      where account_id=${accountId} and id=${m.operationId}`;
    if (receipt) {
      if (receipt.request_hash !== hash) throw new AccountError(409, "Operation ID reused for a different change");
      return receipt.result;
    }
    const [current] = await tx`select id,revision::integer,data,deleted,channel from account_private.journal
      where account_id=${accountId} and id=${m.id} for update`;
    const revision = current?.revision ?? 0;
    if (revision !== m.baseRevision) return { conflict: true, current: current ?? null };
    const [row] = await tx`insert into account_private.journal (account_id,id,revision,data,deleted,channel)
      values (${accountId},${m.id},${revision + 1},${tx.json(m.data as postgres.JSONValue)},${m.deleted},${channel})
      on conflict (account_id,id) do update set revision=excluded.revision,data=excluded.data,
      deleted=excluded.deleted,channel=excluded.channel,updated_at=now()
      returning id,revision::integer,data,deleted,channel`;
    const result = { conflict: false, row };
    await tx`insert into account_private.operations(account_id,id,request_hash,result)
      values (${accountId},${m.operationId},${hash},${tx.json(result)})`;
    return result;
  });
}

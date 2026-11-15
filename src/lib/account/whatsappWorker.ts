import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { claimJob, tokenHash, type Incoming } from "./whatsapp";
import { gateFailures } from "../confidenceGate";
import { toTransaction, type ExtractedTransaction, type Transaction } from "../types";

export type ParsedCapture = { text: string; rows: ExtractedTransaction[]; heardWell: boolean };
export type Pipeline = (message: Incoming) => Promise<ParsedCapture>;
type Job = NonNullable<Awaited<ReturnType<typeof claimJob>>>;
const UUID = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";

export type ReplyAction = { id: string; title: string };
const reviewActions = (id: string): ReplyAction[] => [{ id: `CONFIRM ${id}`, title: "Confirm" }, { id: `DISCARD ${id}`, title: "Discard" }];
const savedActions = (id: string): ReplyAction[] => [{ id: `UNDO ${id}`, title: "Undo" }];
async function reply(tx: postgres.TransactionSql, message: Incoming, text: string, actions: ReplyAction[] = []) {
  await tx`insert into account_private.outbox(id,incoming_id,sender,payload,expires_at)
    values (${randomUUID()},${message.id},${message.sender},${tx.json({ text, actions })},${new Date(message.timestamp * 1000 + 23 * 3600000)})
    on conflict(incoming_id) do nothing`;
}
async function finish(tx: postgres.TransactionSql, job: Job) {
  await tx`update account_private.jobs set state='done',lease_until=null where id=${job.id} and lease_token=${job.leaseToken}`;
}
async function ownsLease(tx: postgres.TransactionSql, job: Job) {
  const [row] = await tx`select id from account_private.jobs where id=${job.id} and state='working'
    and lease_token=${job.leaseToken} and lease_until>now() for update`;
  return Boolean(row);
}
async function saveRows(tx: postgres.TransactionSql, accountId: string, rows: Transaction[]) {
  await tx`select set_config('vaani.account_id',${accountId},true)`;
  for (const row of rows) await tx`insert into account_private.journal(account_id,id,revision,data,deleted,channel)
    values (${accountId},${row.id},1,${tx.json(row as unknown as postgres.JSONValue)},false,'whatsapp')`;
}
const describe = (rows: Transaction[]) => rows.map(row => `₹${row.amount.value ?? "?"} · ${(row.description.value ?? row.payee.value ?? "Expense").slice(0, 80)}`).join("\n");

/** Exactly-once database effects. Network/model work happens outside the transaction. */
export async function processOne(db: postgres.Sql, pipeline: Pipeline, onError?: (error: unknown) => void) {
  const job = await claimJob(db);
  if (!job) return false;
  const message = job.message;
  try {
    if (Date.now() - message.timestamp * 1000 >= 23 * 3600000 || message.timestamp * 1000 > Date.now() + 300000) {
      await db`update account_private.jobs set state='failed',lease_until=null,error_code='message_outside_window'
        where id=${job.id} and lease_token=${job.leaseToken}`;
      return true;
    }
    const link = message.text?.trim().match(/^LINK ([a-f0-9]{64})$/);
    if (link) {
      await db.begin(async tx => {
        if (!await ownsLease(tx, job)) return;
        const [token] = await tx`update account_private.link_tokens set sender=${message.sender},consumed_at=now()
          where token_hash=${tokenHash(link[1])} and expires_at>now() and consumed_at is null returning account_id`;
        await reply(tx, message, token ? "Return to VaaniTrack and confirm your masked phone number to finish linking." : "This link expired or was already used. Request a new link in VaaniTrack.");
        // Do not retain the plaintext link secret in the durable message.
        await tx`update account_private.incoming set payload=${tx.json({ ...message, text: "LINK [redacted]" })} where id=${message.id}`;
        await finish(tx, job);
      });
      return true;
    }
    const [channel] = await db`select account_id,review_all,confirmed_at,link_id from account_private.channels where sender=${message.sender}`;
    if (!channel || new Date(channel.confirmed_at).getTime() > message.timestamp * 1000 + 1000) {
      await db.begin(async tx => {
        if (!await ownsLease(tx, job)) return;
        await reply(tx, message, "Link WhatsApp from your signed-in VaaniTrack account before sending expenses.");
        await finish(tx, job);
      });
      return true;
    }
    const command = message.text?.trim().match(new RegExp(`^(UNDO|CONFIRM|DISCARD|EDIT)\\s+(${UUID})(?:\\s+([\\s\\S]+))?$`, "i"));
    let captureId = command?.[2], action = command?.[1].toUpperCase();
    if (!command && message.replyTo && /^(undo|confirm|discard)$/i.test(message.text?.trim() ?? "")) {
      const [reference] = await db`select c.id from account_private.outbox o join account_private.captures c on c.incoming_id=o.incoming_id
        where o.provider_id=${message.replyTo} and c.account_id=${channel.account_id}`;
      captureId = reference?.id; action = message.text!.trim().toUpperCase();
    }
    const isCommand = Boolean(action);
    let parsed: ParsedCapture | undefined;
    if (!isCommand || action === "EDIT") {
      if (message.type === "text" && (!message.text?.trim() || message.text.length > 2000)) throw new Error("text_limit");
      parsed = await pipeline(action === "EDIT" ? { ...message, type: "text", text: command?.[3] ?? "", mediaId: undefined } : message);
      if (!parsed.text.trim() || parsed.text.length > 4000 || !parsed.rows.length || parsed.rows.length > 20) throw new Error("no_expense");
    }
    await db.begin(async tx => {
      if (!await ownsLease(tx, job)) return;
      await tx`select pg_advisory_xact_lock(hashtextextended(${channel.account_id},0))`;
      const [stillLinked] = await tx`select account_id from account_private.channels where sender=${message.sender} and account_id=${channel.account_id}
        and link_id=${channel.link_id}`;
      if (!stillLinked) { await finish(tx, job); return; }
      await tx`select set_config('vaani.account_id',${channel.account_id},true)`;
      if (isCommand) {
        const [capture] = captureId ? await tx`select * from account_private.captures where id=${captureId} and account_id=${channel.account_id} for update` : [];
        if (!capture) { await reply(tx, message, "Reply to the expense acknowledgement, or include its reference. Nothing changed."); await finish(tx, job); return; }
        const rows = capture.rows as Transaction[];
        if (action === "UNDO" && capture.state === "saved") {
          const saved = await tx`select id,revision,deleted from account_private.journal where account_id=${channel.account_id} and id in ${tx(rows.map(row => row.id))} for update`;
          if (saved.length !== rows.length || saved.some(row => Number(row.revision) !== 1 || row.deleted)) {
            await reply(tx, message, "This expense was edited. Open VaaniTrack to review it before deleting; nothing changed.");
          } else {
            await tx`update account_private.journal set deleted=true,data=null,revision=revision+1,updated_at=now()
              where account_id=${channel.account_id} and id in ${tx(rows.map(row => row.id))}`;
            await tx`update account_private.captures set state='undone' where id=${capture.id}`;
            await reply(tx, message, "Undone. The expense was removed.");
          }
        } else if (action === "CONFIRM" && capture.state === "review") {
          if (rows.some(row => row.amount.value === null || !Number.isFinite(row.amount.value))) {
            await reply(tx, message, `An amount is missing. Send EDIT ${capture.id} followed by the corrected expense.`);
          } else {
            await saveRows(tx, channel.account_id, rows);
            await tx`update account_private.captures set state='saved' where id=${capture.id}`;
            await reply(tx, message, `Saved ${describe(rows)}\nUndo: UNDO ${capture.id}`, savedActions(capture.id));
          }
        } else if (action === "DISCARD" && capture.state === "review") {
          await tx`update account_private.captures set state='discarded' where id=${capture.id}`;
          await reply(tx, message, "Discarded. Nothing saved.");
        } else if (action === "EDIT" && capture.state === "review" && parsed) {
          const updated = parsed.rows.map(row => toTransaction(row, parsed!.text, "manual"));
          await tx`update account_private.captures set rows=${tx.json(updated as unknown as postgres.JSONValue)},transcript=${parsed.text} where id=${capture.id}`;
          await reply(tx, message, `Please check:\n${describe(updated)}\nCONFIRM ${capture.id}\nDISCARD ${capture.id}`, reviewActions(capture.id));
        } else await reply(tx, message, "This action was already handled or no longer applies. Nothing changed.");
      } else if (parsed) {
        const rows = parsed.rows.map(row => toTransaction(row, parsed!.text, message.type === "audio" ? "voice" : "manual"));
        const review = parsed.rows.some(row => gateFailures(row, parsed!.heardWell, channel.review_all).length > 0);
        const reference = randomUUID();
        await tx`insert into account_private.captures(id,incoming_id,account_id,state,transcript,rows)
          values (${reference},${message.id},${channel.account_id},${review ? "review" : "saved"},${parsed.text},${tx.json(rows as unknown as postgres.JSONValue)})`;
        if (!review) await saveRows(tx, channel.account_id, rows);
        await reply(tx, message, review
          ? `Please check:\n${describe(rows)}\nCONFIRM ${reference}\nEDIT ${reference} followed by corrected words\nDISCARD ${reference}`
          : `Saved ${describe(rows)}\nUndo: UNDO ${reference}`, review ? reviewActions(reference) : savedActions(reference));
      }
      await finish(tx, job);
    });
  } catch (error) {
    onError?.(error);
    // A retry can run the model again, but cannot commit the same expense twice.
    await db.begin(async tx => {
      if (!await ownsLease(tx, job)) return;
      if (job.attempts >= 3) {
        const recovery = error && typeof error === "object" && "recoveryText" in error && typeof error.recoveryText === "string" ? error.recoveryText.slice(0, 1000) : "";
        if (recovery) await tx`update account_private.incoming set payload=payload || ${tx.json({ recoveryText: recovery })}::jsonb where id=${message.id}`;
        await reply(tx, message, `Couldn't record that. Nothing saved.${recovery ? ` Heard: “${recovery}”. You can copy, correct, and resend those words.` : " Try a short text expense or a voice note under 60 seconds."}`);
        await tx`update account_private.jobs set state='failed',lease_until=null,error_code='capture_failed' where id=${job.id}`;
      } else await tx`update account_private.jobs set state='pending',lease_until=null,available_at=now()+interval '30 seconds',error_code='retry' where id=${job.id}`;
    });
  }
  return true;
}

/** At-most-once attempt: a crash/timeout after send is ambiguous, never blindly retried. */
export async function deliverOne(db: postgres.Sql, send: (sender: string, text: string, actions: ReplyAction[]) => Promise<string>) {
  const [item] = await db`update account_private.outbox set state='sending' where id=(select id from account_private.outbox
    where state='pending' and expires_at>now() order by created_at for update skip locked limit 1) returning *`;
  if (!item) return false;
  try {
    const providerId = await send(item.sender, item.payload.text, item.payload.actions ?? []);
    await db`update account_private.outbox set state='sent',provider_id=${providerId} where id=${item.id}`;
  } catch { await db`update account_private.outbox set state='unknown' where id=${item.id}`; }
  return true;
}

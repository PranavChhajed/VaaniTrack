import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { parseIncoming, persistIncoming, validSignature, tokenHash, type Incoming } from "../src/lib/account/whatsapp";
import { processOne, deliverOne } from "../src/lib/account/whatsappWorker";
import { quickExpense } from "../src/lib/quickExpense";

const url = process.env.ACCOUNT_TEST_DATABASE_URL;
if (!url || !/^postgres:\/\/vt_test@(?:localhost|127\.0\.0\.1):55439\/vt_test$/.test(url)) throw Error("Isolated database required");
const db = postgres(url, { max: 5 });
let checks = 0;
function check(value: unknown) { assert.ok(value); checks++; }
const account = randomUUID(), sender = `test-${randomUUID()}`;
const message = (text: string): Incoming => ({ id: randomUUID(), sender, type: "text", text, timestamp: Math.floor(Date.now()/1000) });
const pipeline = async (incoming: Incoming) => ({ text: incoming.text!, rows: quickExpense(incoming.text!, "2026-11-15", "UPI") ?? [], heardWell: true });
const enqueue = async (text: string) => { const incoming = message(text); await persistIncoming(db, [incoming]); return incoming; };
async function main() {
  try {
    const [exists] = await db`select to_regclass('account_private.captures') as found`;
    if (!exists.found) {
      const migration = postgres(url!, { max: 1 });
      try { await migration.unsafe(await readFile("supabase/007_whatsapp_captures.sql", "utf8")); } finally { await migration.end(); }
    }
    const raw = Buffer.from('{"object":"whatsapp_business_account"}');
    const signature = `sha256=${createHmac("sha256", "test-secret").update(raw).digest("hex")}`;
    check(validSignature(raw, signature, "test-secret"));
    check(!validSignature(Buffer.from(raw + " "), signature, "test-secret"));
    check(!validSignature(raw, "sha256=x", "test-secret"));
    check(!validSignature(raw, signature, "wrong"));
    const payload = { object: "whatsapp_business_account", entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "test-number" }, messages: [{ id: "message", from: sender, timestamp: "1794736800", type: "text", text: { body: "250 lunch" } }],
    } }] }] };
    check(parseIncoming(payload, "test-number", new Set([sender])).length === 1);
    check(parseIncoming(payload, "other-number", new Set([sender])).length === 0);
    check(parseIncoming(payload, "test-number", new Set()).length === 0);
    assert.throws(() => parseIncoming({ object: "page" }, "test-number", new Set())); checks++;
    const token = "a".repeat(64);
    await db`insert into account_private.link_tokens(token_hash,account_id,expires_at) values (${tokenHash(token)},${account},now()+interval '10 minutes')`;
    await enqueue(`LINK ${token}`); await processOne(db, pipeline);
    const [linked] = await db`select * from account_private.link_tokens where account_id=${account}`;
    check(linked.sender === sender && linked.consumed_at);
    const [storedLink] = await db`select payload from account_private.incoming where sender=${sender}`;
    check(storedLink.payload.text === "LINK [redacted]");
    await db`insert into account_private.channels(account_id,sender,review_all,confirmed_at) values (${account},${sender},false,now()-interval '1 minute')`;
    const expense = await enqueue("250 lunch");
    await persistIncoming(db, [expense, expense]);
    await Promise.all([processOne(db, pipeline, console.error), processOne(db, pipeline, console.error)]);
    const saved = await db`select * from account_private.journal where account_id=${account}`;
    check(saved.length === 1 && saved[0].data.amount.value === 250);
    const [capture] = await db`select * from account_private.captures where incoming_id=${expense.id}`;
    check(capture.state === "saved");
    await enqueue(`UNDO ${capture.id}`); await processOne(db, pipeline);
    const [undone] = await db`select * from account_private.journal where account_id=${account}`;
    check(undone.deleted && Number(undone.revision) === 2);
    await enqueue(`UNDO ${capture.id}`); await processOne(db, pipeline);
    check(Number((await db`select revision from account_private.journal where account_id=${account}`)[0].revision) === 2);
    await db`update account_private.channels set review_all=true where account_id=${account}`;
    const reviewMessage = await enqueue("40 chai"); await processOne(db, pipeline);
    const [review] = await db`select * from account_private.captures where incoming_id=${reviewMessage.id}`;
    check(review.state === "review");
    check((await db`select * from account_private.journal where account_id=${account}`).length === 1);
    await enqueue(`CONFIRM ${review.id}`); await processOne(db, pipeline);
    check((await db`select * from account_private.journal where account_id=${account} and not deleted`).length === 1);
    await db`update account_private.journal set revision=2 where account_id=${account} and not deleted`;
    await enqueue(`UNDO ${review.id}`); await processOne(db, pipeline);
    check((await db`select * from account_private.journal where account_id=${account} and not deleted`).length === 1);
    const crash = await enqueue("50 chai");
    await db`update account_private.jobs set state='working',lease_until=now()-interval '1 minute' where id=${crash.id}`;
    await processOne(db, pipeline);
    check((await db`select * from account_private.captures where incoming_id=${crash.id}`).length === 1);
    let sends = 0;
    // Isolated fixture queue only; no actual network request.
    await deliverOne(db, async () => { sends++; throw Error("ambiguous timeout"); });
    check(sends === 1);
    const [unknown] = await db`select count(*)::integer as n from account_private.outbox where sender=${sender} and state='unknown'`;
    check(unknown.n === 1);
    while (await deliverOne(db, async () => { sends++; return randomUUID(); })) { /* drain fixture replies */ }
    check((await db`select count(*)::integer as n from account_private.outbox where sender=${sender} and state='unknown'`)[0].n === 1);
    console.log(`WhatsApp durability: ${checks} checks passed (signed fixtures and isolated PostgreSQL)`);
  } finally {
    await db`delete from account_private.outbox where sender=${sender}`;
    await db`delete from account_private.captures where account_id=${account}`;
    await db`delete from account_private.jobs where id in (select id from account_private.incoming where sender=${sender})`;
    await db`delete from account_private.incoming where sender=${sender}`;
    await db`delete from account_private.journal where account_id=${account}`;
    await db`delete from account_private.channels where account_id=${account}`;
    await db`delete from account_private.link_tokens where account_id=${account}`;
    await db.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

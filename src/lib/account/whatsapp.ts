import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import type postgres from "postgres";

export function whatsappEnabled() { return process.env.WHATSAPP_ENABLED === "1"; }
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function validSignature(raw: Uint8Array, signature: string | null, secret: string) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}
export type Incoming = { id: string; sender: string; timestamp: number; type: "text" | "audio"; text?: string; mediaId?: string; mime?: string; replyTo?: string };

/** Accept only our test number and explicitly allowed test senders. */
export function parseIncoming(payload: unknown, phoneId: string, allowed: Set<string>): Incoming[] {
  if (!payload || typeof payload !== "object") throw new Error("Invalid webhook");
  const root = payload as { object?: string; entry?: { changes?: { value?: {
    metadata?: { phone_number_id?: string }; messages?: Record<string, unknown>[];
  } }[] }[] };
  if (root.object !== "whatsapp_business_account") throw new Error("Invalid webhook object");
  const result: Incoming[] = [];
  for (const entry of root.entry ?? []) for (const change of entry.changes ?? []) {
    const value = change.value;
    if (!phoneId || value?.metadata?.phone_number_id !== phoneId) continue;
    for (const message of value.messages ?? []) {
      if (typeof message.id !== "string" || message.id.length > 300 || typeof message.from !== "string" || !allowed.has(message.from)) continue;
      const timestamp = Number(message.timestamp);
      if (!Number.isSafeInteger(timestamp) || timestamp <= 0) continue;
      const replyTo = (message.context as { id?: string } | undefined)?.id;
      const base = { id: message.id, sender: message.from, timestamp,
        ...(typeof replyTo === "string" && replyTo.length <= 300 ? { replyTo } : {}) };
      if (message.type === "text") {
        const text = (message.text as { body?: string })?.body;
        if (typeof text === "string") result.push({ ...base, type: "text", text: text.slice(0, 2001) });
      } else if (message.type === "interactive") {
        const interactive = message.interactive as { type?: string; button_reply?: { id?: string } };
        const action = interactive?.button_reply?.id;
        if (interactive?.type === "button_reply" && typeof action === "string" && action.length <= 100) {
          result.push({ ...base, type: "text", text: action });
        }
      } else if (message.type === "audio") {
        const audio = message.audio as { id?: string; mime_type?: string };
        if (typeof audio?.id === "string" && audio.id.length <= 200) result.push({ ...base, type: "audio", mediaId: audio.id, mime: audio.mime_type });
      }
    }
  }
  return result;
}

export async function persistIncoming(db: postgres.Sql, messages: Incoming[]) {
  await db.begin(async tx => {
    for (const message of messages) {
      const inserted = await tx`insert into account_private.incoming(id,sender,payload)
        values (${message.id},${message.sender},${tx.json(message)}) on conflict do nothing returning id`;
      if (inserted.length) await tx`insert into account_private.jobs(id) values (${message.id})`;
    }
  });
}

export async function claimJob(db: postgres.Sql) {
  const [job] = await db`update account_private.jobs set state='working', attempts=attempts+1,
    lease_until=now()+interval '5 minutes', lease_token=gen_random_uuid()
    where id=(select id from account_private.jobs where
      (state='pending' and available_at<=now()) or (state='working' and lease_until<now())
      order by available_at for update skip locked limit 1)
    returning id,attempts,lease_token`;
  if (!job) return null;
  const [incoming] = await db`select payload from account_private.incoming where id=${job.id}`;
  return { id: job.id as string, attempts: job.attempts as number, leaseToken: job.lease_token as string, message: incoming.payload as Incoming };
}

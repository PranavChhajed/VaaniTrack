import { randomBytes } from "node:crypto";
import { AccountError, accountDb, accountFailure, requireAccount, sameOrigin } from "@/lib/account/server";
import { tokenHash, whatsappEnabled } from "@/lib/account/whatsapp";

export async function GET(request: Request) {
  try {
    if (!whatsappEnabled()) throw new AccountError(404, "WhatsApp beta is not enabled yet");
    const account = await requireAccount(request);
    if (request.headers.get("x-vaani-account") !== account.id) throw new AccountError(409, "Account changed");
    const db = accountDb();
    const [channel] = await db`select sender from account_private.channels where account_id=${account.id}`;
    const [pending] = await db`select sender,token_hash from account_private.link_tokens where account_id=${account.id}
      and expires_at>now() and consumed_at is not null order by expires_at desc limit 1`;
    return Response.json({ linked: channel ? `••••${channel.sender.slice(-4)}` : null,
      pending: pending?.sender ? `••••${pending.sender.slice(-4)}` : null,
      pendingId: pending?.token_hash ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountFailure(error); }
}

export async function POST(request: Request) {
  try {
    if (!whatsappEnabled()) throw new AccountError(404, "WhatsApp beta is not enabled yet");
    if (!sameOrigin(request)) throw new AccountError(403, "Invalid origin");
    const account = await requireAccount(request);
    if (request.headers.get("x-vaani-account") !== account.id) throw new AccountError(409, "Account changed");
    const body = await request.json();
    const db = accountDb();
    if (body.action === "start") {
      const number = process.env.WHATSAPP_BUSINESS_NUMBER;
      if (!number || !/^\d{8,15}$/.test(number)) throw new AccountError(503, "Test number not configured");
      const token = randomBytes(32).toString("hex");
      await db.begin(async tx => {
        await tx`select pg_advisory_xact_lock(hashtextextended(${account.id},0))`;
        await tx`delete from account_private.link_tokens where account_id=${account.id}`;
        await tx`insert into account_private.link_tokens(token_hash,account_id,expires_at)
          values (${tokenHash(token)},${account.id},now()+interval '10 minutes')`;
      });
      return Response.json({ url: `https://wa.me/${number}?text=${encodeURIComponent(`LINK ${token}`)}`, expiresIn: 600 }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "unlink") {
      await db.begin(async tx => {
        await tx`select pg_advisory_xact_lock(hashtextextended(${account.id},0))`;
        await tx`delete from account_private.channels where account_id=${account.id}`;
        await tx`delete from account_private.link_tokens where account_id=${account.id}`;
      });
      return Response.json({ ok: true });
    }
    if (body.action !== "confirm") throw new AccountError(400, "Invalid action");
    if (typeof body.pendingId !== "string" || !/^[a-f0-9]{64}$/.test(body.pendingId)) throw new AccountError(400, "Check the pending number before confirming");
    await db.begin(async tx => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${account.id},0))`;
      const [pending] = await tx`select sender from account_private.link_tokens where account_id=${account.id}
        and token_hash=${body.pendingId} and expires_at>now() and consumed_at is not null for update`;
      if (!pending?.sender) throw new AccountError(409, "Send the link message first, or request a new link");
      const [existing] = await tx`select account_id from account_private.channels where sender=${pending.sender}`;
      if (existing && existing.account_id !== account.id) throw new AccountError(409, "This number is already linked to another account");
      await tx`insert into account_private.channels(account_id,sender,review_all) values (${account.id},${pending.sender},${body.reviewAll !== false})
        on conflict(account_id) do update set sender=excluded.sender,confirmed_at=now(),link_id=gen_random_uuid(),review_all=excluded.review_all`;
      await tx`delete from account_private.link_tokens where account_id=${account.id}`;
    });
    return Response.json({ ok: true });
  } catch (error) { return accountFailure(error); }
}

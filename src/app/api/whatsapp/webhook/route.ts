import { timingSafeEqual } from "node:crypto";
import { accountDb } from "@/lib/account/server";
import { parseIncoming, persistIncoming, validSignature, whatsappEnabled } from "@/lib/account/whatsapp";

export async function GET(request: Request) {
  if (!whatsappEnabled()) return new Response(null, { status: 404 });
  const url = new URL(request.url);
  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
  const supplied = url.searchParams.get("hub.verify_token") ?? "";
  if (url.searchParams.get("hub.mode") !== "subscribe" || !expected || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return new Response(null, { status: 403 });
  return new Response(url.searchParams.get("hub.challenge") ?? "", { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!whatsappEnabled()) return new Response(null, { status: 404 });
  if (Number(request.headers.get("content-length")) > 256000) return new Response(null, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const parts: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > 256000) { await reader.cancel(); return new Response(null, { status: 413 }); }
    parts.push(value);
  }
  const raw = Buffer.concat(parts);
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET ?? "")) return new Response(null, { status: 401 });
  let messages;
  try {
    messages = parseIncoming(JSON.parse(raw.toString("utf8")), process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
      new Set((process.env.WHATSAPP_TEST_SENDERS ?? "").split(",").map(value => value.trim()).filter(Boolean)));
  } catch { return new Response(null, { status: 400 }); }
  try {
    await persistIncoming(accountDb(), messages);
    return new Response(null, { status: 200 });
  } catch { return new Response(null, { status: 503 }); } // Meta retries; never acknowledge a lost event.
}

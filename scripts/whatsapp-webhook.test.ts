import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { GET, POST } from "../src/app/api/whatsapp/webhook/route";

async function main() {
  let checks = 0;
  const check = (value: unknown) => { assert.ok(value); checks++; };
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const signature = `sha256=${createHmac("sha256", "fixture-secret").update(body).digest("hex")}`;
  const post = (text: string, sig?: string) => new Request("https://example.test/api/whatsapp/webhook", {
    method: "POST", body: text, headers: sig ? { "x-hub-signature-256": sig } : {},
  });
  delete process.env.WHATSAPP_ENABLED;
  check((await POST(post(body, signature))).status === 404);
  process.env.WHATSAPP_ENABLED = "1";
  process.env.WHATSAPP_APP_SECRET = "fixture-secret";
  process.env.WHATSAPP_VERIFY_TOKEN = "fixture-verify";
  delete process.env.ACCOUNT_DATABASE_URL;
  check((await GET(new Request("https://example.test/?hub.mode=subscribe&hub.verify_token=wrong"))).status === 403);
  const challenge = await GET(new Request("https://example.test/?hub.mode=subscribe&hub.verify_token=fixture-verify&hub.challenge=12345"));
  check(challenge.status === 200 && await challenge.text() === "12345");
  check((await POST(post(body))).status === 401);
  check((await POST(post(body + " ", signature))).status === 401);
  check((await POST(post("x".repeat(256001)))).status === 413);
  check((await POST(post(body, signature))).status === 503); // No durable storage, no acknowledgement.
  console.log(`WhatsApp webhook: ${checks} route checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

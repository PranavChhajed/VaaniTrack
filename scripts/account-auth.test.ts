import assert from "node:assert/strict";
import { GET, POST, DELETE } from "../src/app/api/account/session/route";
import { requireAccount } from "../src/lib/account/server";

process.env.APP_ORIGIN = "https://example.test";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.example.test";
process.env.SUPABASE_PUBLISHABLE_KEY = "test-only";
process.env.ACCOUNT_BETA_EMAILS = "a@example.test";
const id = "11111111-1111-4111-8111-111111111111";
const user = { id, email: "a@example.test", email_confirmed_at: "2026-11-15T00:00:00Z" };
const request = (body: unknown, origin = "https://example.test", cookie = "") => new Request("https://example.test/api/account/session", {
  method: "POST", headers: { origin, cookie }, body: JSON.stringify(body),
});
let calls = 0, checks = 0;
function check(value: unknown) { assert.ok(value); checks++; }
async function main() {
  globalThis.fetch = async (input) => {
    calls++;
    if (String(input).endsWith("user")) return Response.json(user);
    return Response.json({ user, access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600 });
  };
  delete process.env.ACCOUNTS_ENABLED;
  check((await POST(request({ action: "send", email: user.email }))).status === 404);
  check(calls === 0);
  process.env.ACCOUNTS_ENABLED = "1";
  check((await POST(request({ action: "send", email: user.email }, "https://evil.test"))).status === 403);
  check((await POST(request({ action: "send", email: "outsider@example.test" }))).status === 403);
  check(calls === 0);
  check((await POST(request({ action: "send", email: user.email }))).status === 200);
  check((await POST(request({ action: "verify", email: user.email, code: "invalid" }))).status === 400);
  const response = await POST(request({ action: "verify", email: user.email, code: "123456" }));
  check(response.status === 200);
  const cookies = response.headers.get("set-cookie")!;
  check(cookies.includes("HttpOnly") && cookies.includes("SameSite=strict"));
  const body = await response.json();
  check(body.account.id === id && !body.access_token && !body.refresh_token);
  check((await GET(new Request("https://example.test"))).status === 401);
  check((await requireAccount(new Request("https://example.test", { headers: { cookie: "vt_access=test-access" } }))).id === id);
  globalThis.fetch = async () => Response.json({ ...user, email: "outsider@example.test" });
  await assert.rejects(requireAccount(new Request("https://example.test", { headers: { cookie: "vt_access=test-access" } }))); checks++;
  globalThis.fetch = async () => Response.json({ ...user, email_confirmed_at: null });
  await assert.rejects(requireAccount(new Request("https://example.test", { headers: { cookie: "vt_access=test-access" } }))); checks++;
  check((await POST(request({ action: "refresh" }))).status === 401);
  check((await DELETE(request({}, "https://evil.test"))).status === 403);
  const signedOut = await DELETE(request({}));
  check(signedOut.status === 200 && signedOut.headers.get("set-cookie")!.includes("Max-Age=0"));
  console.log(`Account authentication: ${checks} checks passed (provider fixtures)`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

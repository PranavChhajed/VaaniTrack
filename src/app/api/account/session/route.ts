import { NextResponse } from "next/server";
import { accountsEnabled, accountFailure, AccountError, allowedEmail, authRequest, cookieValue, requireAccount, sameOrigin } from "@/lib/account/server";

const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" };
export async function GET(request: Request) {
  try {
    return NextResponse.json({ account: await requireAccount(request) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountFailure(error); }
}

export async function POST(request: Request) {
  try {
    if (!accountsEnabled()) throw new AccountError(404, "Accounts are not enabled yet. Continue without an account.");
    if (!sameOrigin(request)) throw new AccountError(403, "Invalid origin");
    const raw = await request.text();
    if (raw.length > 1500) throw new AccountError(413, "Request too large");
    let body;
    try { body = JSON.parse(raw); } catch { throw new AccountError(400, "Invalid request"); }
    if (body.action === "refresh") {
      const refresh = cookieValue(request, "vt_refresh");
      if (!refresh) throw new AccountError(401, "Sign in again");
      const upstream = await authRequest("token?grant_type=refresh_token", { refresh_token: refresh });
      if (!upstream.ok) throw new AccountError(401, "Sign in again");
      return establishSession(await upstream.json());
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!allowedEmail(email)) throw new AccountError(403, "Accounts are currently invite-only. Your local journal still works.");
    if (body.action === "send") {
      const upstream = await authRequest("otp", { email, create_user: true });
      if (!upstream.ok) throw new AccountError(429, "Could not send a code. Wait a minute and try again.");
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action !== "verify" || typeof body.code !== "string" || !/^\d{6,8}$/.test(body.code)) {
      throw new AccountError(400, "Enter the code from your email");
    }
    const upstream = await authRequest("verify", { type: "email", email, token: body.code });
    if (!upstream.ok) throw new AccountError(401, "That code expired or is incorrect. Request a new code.");
    return establishSession(await upstream.json());
  } catch (error) { return accountFailure(error); }
}

function establishSession(session: { access_token?: string; refresh_token?: string; expires_in?: number; user?: { id: string; email: string; email_confirmed_at?: string } }) {
  if (!session.access_token || !session.refresh_token || !session.user?.email_confirmed_at || !allowedEmail(session.user.email)) {
    throw new AccountError(403, "Unable to verify this beta account");
  }
  const response = NextResponse.json({ account: { id: session.user.id, email: session.user.email } }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set("vt_access", session.access_token, { ...cookieOptions, maxAge: Math.min(session.expires_in ?? 3600, 3600) });
  response.cookies.set("vt_refresh", session.refresh_token, { ...cookieOptions, maxAge: 60 * 60 * 24 * 30 });
  return response;
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return accountFailure(new AccountError(403, "Invalid origin"));
  // Revoke provider session when available; always remove this browser's cookies.
  const token = cookieValue(request, "vt_access");
  if (token) { try { await authRequest("logout", {}, token); } catch { /* local sign-out still works */ } }
  const response = NextResponse.json({ ok: true });
  response.cookies.set("vt_access", "", { ...cookieOptions, maxAge: 0 });
  response.cookies.set("vt_refresh", "", { ...cookieOptions, maxAge: 0 });
  return response;
}

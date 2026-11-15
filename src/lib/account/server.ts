import postgres from "postgres";

/** Deliberately separate from anonymous diagnostics. Never swallow journal errors. */
let connection: postgres.Sql | undefined;
export function accountDb() {
  if (!process.env.ACCOUNT_DATABASE_URL) throw new Error("Account database unavailable");
  return connection ??= postgres(process.env.ACCOUNT_DATABASE_URL, {
    max: 2, prepare: false, connect_timeout: 10, idle_timeout: 20,
  });
}

export function accountsEnabled() {
  return process.env.ACCOUNTS_ENABLED === "1";
}

export function allowedEmail(email: string) {
  return (process.env.ACCOUNT_BETA_EMAILS ?? "").split(",")
    .map(value => value.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

export function sameOrigin(request: Request) {
  const expected = process.env.APP_ORIGIN;
  return Boolean(expected && request.headers.get("origin") === expected);
}

export function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Account sign-in unavailable");
  return { url, key };
}

export async function authRequest(path: string, body?: unknown, token?: string) {
  const { url, key } = authConfig();
  return fetch(`${url}/auth/v1/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { apikey: key, ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
}

export function cookieValue(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map(p => p.trim())
    .find(p => p.startsWith(`${name}=`))?.slice(name.length + 1);
}

/** The auth provider validates the token on every account request; a local UUID is never identity. */
export async function requireAccount(request: Request): Promise<{ id: string; email: string }> {
  if (!accountsEnabled()) throw new AccountError(404, "Accounts are not enabled");
  const token = cookieValue(request, "vt_access");
  if (!token) throw new AccountError(401, "Sign in to continue");
  const response = await authRequest("user", undefined, token);
  if (!response.ok) throw new AccountError(401, "Sign in again to sync");
  const user = await response.json();
  if (typeof user.id !== "string" || typeof user.email !== "string" ||
      !user.email_confirmed_at || !allowedEmail(user.email)) {
    throw new AccountError(403, "This account is not in the beta");
  }
  return { id: user.id, email: user.email };
}

export class AccountError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function accountFailure(error: unknown) {
  return Response.json({ error: error instanceof AccountError ? error.message : "Service unavailable. Your local expenses are safe." },
    { status: error instanceof AccountError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}

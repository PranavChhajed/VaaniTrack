"use client";
import { activeAccount, selectAccount } from "./account/local";
export type Session = ReturnType<typeof activeAccount>;
export type AuthResult = { ok: true } | { ok: false; error: string };
export const currentSession = activeAccount;
export async function requestCode(email: string): Promise<AuthResult> {
  return request({ action: "send", email });
}
export async function verifyCode(email: string, code: string): Promise<AuthResult> {
  return request({ action: "verify", email, code });
}
async function request(body: unknown): Promise<AuthResult> {
  try {
    const response = await fetch("/api/account/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) return { ok: false, error: result.error ?? "Sign-in is unavailable" };
    if (result.account) selectAccount(result.account);
    return { ok: true };
  } catch { return { ok: false, error: "Couldn't connect. Your local journal still works." }; }
}
export async function signOut(): Promise<void> {
  selectAccount(null);
  try { await fetch("/api/account/session", { method: "DELETE" }); } catch { /* offline sign-out */ }
}

"use client";

/**
 * Stub authentication. docs/design/AUTH-ONBOARDING.md §5.
 *
 * A session here is a UI concept, nothing more. There is no server, no real
 * account, and no data behind it; `docs/design/README.md` explains why:
 * the server read path (`listTransactions()` in observe.ts) has zero
 * callers, so an account could not restore anything yet even if this were
 * real. Every screen imports only from this module, so replacing it with
 * Supabase Auth later is a single-file change.
 *
 * **The one rule this file must never break:** it must never write
 * `vaanitrack.device` or otherwise influence `deviceId()`. Identity stays
 * the anonymous UUID that `observe.ts`'s `validDeviceId()` depends on:
 * swapping it for a non-UUID user id would silently stop every database
 * write while the app kept returning 200. See device.ts.
 *
 * A deliberate simplification: no password is ever stored, not even here,
 * not even as a stub. `signIn` only checks whether this browser has signed
 * up before; `signUp` records an email in a local, unencrypted list purely
 * so `signIn` has something real (if trivial) to check, and so the error
 * state below is an honest local fact rather than a fabricated one. This
 * whole file is deleted, not extended, when real auth lands.
 */

const SESSION_KEY = "vaanitrack.session";
const ACCOUNTS_KEY = "vaanitrack.stubAccounts";
/** Fake network latency, purely so the "submitting" state in the UI has
 *  something real to show rather than resolving instantly every time. */
const STUB_DELAY_MS = 500;

export type Session = { email: string } | null;
export type AuthResult = { ok: true } | { ok: false; error: string };

function readAccounts(): string[] {
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeSession(email: string): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ email }));
  } catch {
    /* a session we can't persist just doesn't survive a reload; no
       capture-path consequence, unlike a dropped device id or consent */
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The session for this browser, or null if signed out. Safe to call during
 *  server rendering: returns null rather than throwing. */
export function currentSession(): Session {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export async function signUp(email: string, _password: string): Promise<AuthResult> {
  await wait(STUB_DELAY_MS);
  try {
    const accounts = readAccounts();
    if (!accounts.includes(email)) {
      window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...accounts, email]));
    }
    writeSession(email);
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't save that on this device. Try again." };
  }
}

export async function signIn(email: string, _password: string): Promise<AuthResult> {
  await wait(STUB_DELAY_MS);
  // Password is intentionally unchecked; see the file comment. The only
  // thing this stub can honestly verify is whether this browser has ever
  // signed up, so that's the only thing it claims to verify.
  if (!readAccounts().includes(email)) {
    return { ok: false, error: "No account found for that email on this device. Try signing up instead." };
  }
  writeSession(email);
  return { ok: true };
}

export function signOut(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to clean up if it never persisted */
  }
}

"use client";

/**
 * Who this browser is, and what it has agreed to.
 *
 * Not a user account. A random identifier generated once per browser, so that
 * ten failures can be told apart as one person struggling ten times or ten
 * people hitting the same wall, which is usually the question that matters.
 * It carries no personal information and resets if site data is cleared, which
 * is an acceptable trade for asking nobody to sign up.
 */

const DEVICE_KEY = "vaanitrack.device";
const CONSENT_KEY = "vaanitrack.audioConsent";
const ONBOARDED_KEY = "vaanitrack.onboarded";

export type AudioConsent = "unknown" | "granted" | "denied";

/**
 * Stable per-browser id, created on first read.
 *
 * Returns null on the server and when storage is unavailable. A null id means
 * the capture runs unobserved rather than failing; diagnostics are never
 * allowed to be the reason a transaction doesn't get recorded.
 */
export function deviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}

/**
 * Whether this browser has agreed to its recordings being kept.
 *
 * "unknown" means the question hasn't been answered yet, which is distinct
 * from "denied": the first blocks the recorder until asked, the second is a
 * settled no that must be honoured without asking again.
 */
export function audioConsent(): AudioConsent {
  if (typeof window === "undefined") return "unknown";
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    return raw === "granted" || raw === "denied" ? raw : "unknown";
  } catch {
    // Storage blocked: treat as an unanswerable question and keep no audio.
    return "denied";
  }
}

export function setAudioConsent(value: Exclude<AudioConsent, "unknown">): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* a consent we cannot store is a consent we must not assume */
  }
}

/**
 * Whether this browser has been through the first-run flow.
 *
 * Fails toward `true` on a blocked store, the opposite direction from
 * `audioConsent()`, deliberately. Consent is a decision that must not be
 * silently assumed; onboarding is a welcome tour that grants nothing. A
 * browser that can never persist "done" should not be trapped behind an
 * overlay it can never dismiss for good; the consent question itself is
 * asked independently by `AudioConsentGate` regardless of this flag.
 *
 * Also true for any browser that already holds a device id: this flag
 * postdates real usage of the app, so its mere absence must not be read as
 * "never used this before." A returning browser sees nothing new; only a
 * genuinely fresh one runs the flow. See `hasExistingDevice()`.
 */
export function hasOnboarded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (window.localStorage.getItem(ONBOARDED_KEY) === "true") return true;
    return hasExistingDevice();
  } catch {
    return true;
  }
}

/**
 * Whether a device id already exists, without creating one.
 *
 * `deviceId()` mints an id on first read, so it can't answer "is this
 * browser new?"; by the time it returns, the answer would always be yes.
 * This is read-only, purely for that question.
 */
function hasExistingDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DEVICE_KEY) !== null;
  } catch {
    return false;
  }
}

export function setOnboarded(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDED_KEY, "true");
  } catch {
    /* see hasOnboarded()'s fail-safe direction; nothing to do here */
  }
}

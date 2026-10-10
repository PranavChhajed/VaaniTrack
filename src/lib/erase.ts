"use client";

import { deviceId } from "./device";
import { localKeys, removeLocal } from "./localStore";

/** Kept through a wipe: the welcome tour is not data, and showing it again to
 *  someone who has just cleared their journal would read as the app having
 *  forgotten it ever met them rather than as a fresh start. */
const KEEP = new Set(["vaanitrack.onboarded"]);

export type EraseOutcome =
  | { ok: true; recordings: number; captures: number }
  | { ok: false; error: string };

/**
 * Ask the server to forget this device.
 *
 * The phone is only touched after this says yes. If the server could not be
 * reached, the journal is still here and the person is told nothing was
 * removed, instead of finding out later that half of it was.
 */
export async function eraseOnServer(
  scope: "recordings" | "everything",
): Promise<EraseOutcome> {
  const id = deviceId();
  // No device id means storage is blocked, so nothing was ever filed under one.
  if (!id) return { ok: true, recordings: 0, captures: 0 };

  try {
    const res = await fetch("/api/erase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: id, scope }),
    });
    const body = (await res.json()) as EraseOutcome;
    if (res.ok && body.ok) return body;
    return {
      ok: false,
      error: !body.ok && body.error ? body.error : "The server couldn’t delete that. Nothing was removed.",
    };
  } catch {
    return {
      ok: false,
      error: "Couldn’t reach the server. Check your connection. Nothing was removed.",
    };
  }
}

/**
 * Clear everything this app keeps on the phone.
 *
 * The device id goes too, so whatever is recorded next is not tied to the
 * history that was just deleted. The caller reloads the page afterwards: the
 * screens hold the old journal in memory, and a clean load is the one way to
 * be sure none of it is written back.
 */
export function wipeThisPhone(): void {
  for (const key of localKeys("vaanitrack.")) {
    if (!KEEP.has(key)) removeLocal(key);
  }
}

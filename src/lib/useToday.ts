"use client";

import { useSyncExternalStore } from "react";
import { todayISO } from "./journal";

/**
 * Today's date, kept true while a screen stays open.
 *
 * A phone app is not opened and closed like a page: it sits in the background
 * all night and is picked up in the morning. A screen that read the date once,
 * when it was drawn, then goes on calling yesterday "today" (a Today list that
 * still holds yesterday's entries, a "last 7 days" that is a day behind) until
 * something else happens to redraw it.
 *
 * So the date is a live value. It changes by itself at local midnight, and it
 * is checked again whenever the app comes back into view, because a timer does
 * not run while a phone sleeps and may be late or never fire at all.
 *
 * Every component shares one timer and one set of listeners.
 */

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Milliseconds until a moment just after the next local midnight. Built with
 *  the Date constructor so a clock change on that night cannot throw it off. */
function untilMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return Math.max(1000, next.getTime() - now.getTime());
}

function tell() {
  for (const l of listeners) l();
}

function arm() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    tell();
    arm();
  }, untilMidnight());
}

function onBackInView() {
  if (document.visibilityState === "visible") {
    tell();
    arm();
  }
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    arm();
    document.addEventListener("visibilitychange", onBackInView);
    window.addEventListener("focus", onBackInView);
    window.addEventListener("pageshow", onBackInView);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearTimeout(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onBackInView);
      window.removeEventListener("focus", onBackInView);
      window.removeEventListener("pageshow", onBackInView);
    }
  };
}

/** Today as `yyyy-mm-dd`, in the phone's own time zone. */
export function useToday(): string {
  return useSyncExternalStore(subscribe, todayISO, todayISO);
}

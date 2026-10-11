/**
 * Wakes the capture endpoints before they are needed.
 *
 * Each route on the server is its own function, and one that has been idle for a few minutes is
 * stopped: the first request after that pays for starting it (a few hundred milliseconds, and
 * sometimes more), on top of the work it came to do. That cost lands on whoever captures first,
 * which is exactly the moment the person is waiting hardest.
 *
 * An OPTIONS request starts the function and answers at once without doing any of the work (the
 * framework replies to it itself, so nothing here touches the model or the database). It is sent
 * when the capture screen opens, at most once a minute, and nobody waits on it or hears about it
 * failing: a missed warm-up only means the old behaviour.
 */

const ENDPOINTS = ["/api/extract", "/api/transcribe"];
const EVERY_MS = 60_000;

let last = 0;

export function prewarm(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - last < EVERY_MS) return;
  last = now;
  for (const path of ENDPOINTS) {
    fetch(path, { method: "OPTIONS", keepalive: true }).catch(() => {
      /* nothing depends on it */
    });
  }
}

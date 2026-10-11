/**
 * Wakes the capture endpoint while the person is still speaking.
 *
 * A serverless function that has been idle starts from cold on its next request,
 * which can cost several hundred milliseconds that the person spends waiting
 * after they stop talking. Recording takes seconds, so a tiny request sent as
 * recording starts has the function, and the connection to it, ready by the time
 * the audio arrives. At most one a minute; nothing waits on it and nothing breaks
 * if it fails.
 */
let last = 0;

export function warmServer(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - last < 60_000) return;
  last = now;
  try {
    void fetch("/api/transcribe", { method: "OPTIONS", cache: "no-store" }).catch(() => {});
  } catch {
    /* a warm-up is never load-bearing */
  }
}

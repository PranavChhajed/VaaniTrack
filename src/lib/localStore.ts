/**
 * The browser's own storage, as something a component can subscribe to.
 *
 * Everything the app keeps on the phone (the journal, settings, consent, the
 * device id) lives in `localStorage`, which does not exist on the server and
 * does not tell the page when it changes. Components used to cope with that by
 * reading it in an effect and copying it into state, which renders one frame
 * of the wrong thing and is what React's own lint rule flags. A subscribable
 * store lets `useSyncExternalStore` do it properly: the server and the first
 * client render agree on a placeholder, then the real value arrives.
 *
 * Two behaviours worth knowing:
 *
 *   - Writes notify subscribers themselves. The browser's `storage` event only
 *     fires in *other* tabs, never in the one that wrote.
 *   - If storage refuses a write (private mode, blocked site data), the value
 *     is kept in memory for the rest of the session instead. The journal then
 *     behaves as it always did when storage was unavailable: it works, and it
 *     is lost on reload. Without this, an expense saved in such a browser
 *     would simply vanish from the screen.
 */

const memory = new Map<string, string | null>();
const listeners = new Set<() => void>();

export function readLocal(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
    memory.delete(key);
  } catch {
    memory.set(key, value);
  }
  notifyLocal();
}

export function removeLocal(key: string): void {
  memory.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to remove if it never persisted */
  }
  notifyLocal();
}

/** Every key this app has written, for a full wipe. */
export function localKeys(prefix: string): string[] {
  const keys = new Set<string>(
    [...memory.keys()].filter((k) => k.startsWith(prefix)),
  );
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(prefix)) keys.add(key);
    }
  } catch {
    /* storage unavailable: only what was held in memory */
  }
  return [...keys];
}

export function notifyLocal(): void {
  for (const listener of listeners) listener();
}

export function subscribeLocal(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

"use client";

import { useSyncExternalStore } from "react";
import { subscribeLocal } from "./localStore";

/**
 * A value read from browser storage, safe to render on the server.
 *
 * `read` must return a primitive: React compares snapshots with `Object.is`,
 * so a function that builds a new object each call would re-render forever.
 * Read the raw string and parse it with `useMemo`, or reduce to a string,
 * number or boolean here.
 *
 * `server` is what the server render, and the client's first render while it
 * is hydrating, both see. Pick a value that means "not known yet" so a screen
 * can render nothing, or a neutral placeholder, rather than the wrong thing.
 */
export function useLocalValue<
  T extends string | number | boolean | null | undefined,
>(
  read: () => T,
  server: T,
): T {
  return useSyncExternalStore(subscribeLocal, read, () => server);
}

const never = () => () => {};

/**
 * False while the server renders and while the client is hydrating, true
 * after. For a screen that should show nothing, rather than the defaults,
 * until it has read what is actually stored.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
}

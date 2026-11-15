"use client";
import { useEffect, useState, type ReactNode } from "react";

/** localStorage has no cross-tab transaction. Keep one editor for an account,
 * while server revisions still handle concurrent writes from other devices. */
export function AccountWorkspace({ id, children }: { id: string; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!navigator.locks) return;
    const abort = new AbortController();
    let release: (() => void) | undefined;
    void navigator.locks.request(`vaani-editor-${id}`, { signal: abort.signal }, async () => {
      setReady(true);
      await new Promise<void>(resolve => { release = resolve; });
    }).catch(() => {});
    return () => { abort.abort(); release?.(); };
  }, [id]);
  if (!ready) return <main className="mx-auto max-w-lg p-6" role="status">
    <h1 className="text-xl">Opening your account journal</h1>
    <p className="mt-3">If VaaniTrack is open in another tab, close that tab to continue here. Account editing requires a browser with Web Locks support, such as Chrome.</p>
  </main>;
  return children;
}

"use client";

import { useState } from "react";

export function PortalLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not sign in.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto mt-24 w-full max-w-[380px] rounded-[var(--radius-card)] border-2 border-vast-ink bg-paper-raised px-6 py-7"
    >
      <h1 className="display-type text-heading-sm text-vast-ink">Portal</h1>
      <p className="mt-2 font-figtree text-body-sm text-charcoal">
        Diagnostics for VaaniTrack captures.
      </p>

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        aria-label="Portal password"
        autoFocus
        className="mt-6 w-full rounded-[var(--radius-input)] border-2 border-vast-ink bg-paper px-4 py-3 font-figtree text-body-sm text-vast-ink outline-none placeholder:text-fog focus:border-forest-ink"
      />

      {error ? (
        <p className="mt-4 rounded-[var(--radius-input)] border-2 border-alert bg-paper-raised px-4 py-3 font-figtree text-body-sm text-alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || !password}
        className={[
          "mt-5 w-full rounded-[var(--radius-button)] border-2 border-vast-ink px-5 py-3",
          "font-figtree text-body-sm font-medium text-vast-ink",
          busy || !password
            ? "cursor-not-allowed bg-paper-edge opacity-60"
            : "bg-mint-whisper active:bg-mint-deep",
        ].join(" ")}
      >
        {busy ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}

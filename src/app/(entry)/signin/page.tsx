"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth";

const inputClass =
  "w-full rounded-[12px] border-2 border-vast-ink bg-paper px-4 py-3 font-figtree text-body-sm text-vast-ink outline-none focus:border-forest-ink focus-ring";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailError = touched.email && !EMAIL_RE.test(email) ? "Enter a valid email." : null;
  const passwordError = touched.password && password.length === 0 ? "Enter your password." : null;
  const canSubmit = EMAIL_RE.test(email) && password.length > 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!EMAIL_RE.test(email) || password.length === 0) return;

    setSubmitting(true);
    setError(null);
    const result = await signIn(email, password);
    setSubmitting(false);

    if (result.ok) {
      router.push("/");
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="rise">
      <h1 className="display-type text-heading-sm text-vast-ink">Sign in</h1>
      <p className="mt-3 font-figtree text-body-sm text-fog">
        Syncing across devices is coming. Signing in doesn&rsquo;t move any data
        yet &mdash; your journal stays exactly where it is, on this device.
      </p>

      {error && (
        <p className="mt-6 rounded-[12px] border-2 border-vast-ink bg-ember-glow px-4 py-3 font-figtree text-body-sm text-vast-ink">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="font-figtree text-caption text-fog">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            className={`mt-1 ${inputClass}`}
          />
          {emailError && <p className="mt-1 font-figtree text-caption text-forest-ink">{emailError}</p>}
        </div>

        <div>
          <label htmlFor="password" className="font-figtree text-caption text-fog">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            className={`mt-1 ${inputClass}`}
          />
          {passwordError && <p className="mt-1 font-figtree text-caption text-forest-ink">{passwordError}</p>}
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className={`focus-ring mt-2 rounded-[var(--radius-button)] border-2 border-vast-ink px-6 py-4 font-figtree text-body-sm font-medium text-vast-ink ${
            canSubmit
              ? "bg-mint-whisper hover:bg-forest-ink hover:text-paper active:bg-mint-deep"
              : "cursor-not-allowed bg-paper-edge opacity-60"
          }`}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-6 flex flex-col items-center gap-3">
        <Link
          href="/signup"
          className="focus-ring font-figtree text-body-sm text-charcoal underline underline-offset-4 hover:text-vast-ink"
        >
          Don&rsquo;t have an account? Sign up
        </Link>
        <Link
          href="/"
          className="focus-ring font-figtree text-body-sm text-fog underline underline-offset-4 hover:text-vast-ink"
        >
          Continue without an account
        </Link>
      </div>
    </div>
  );
}

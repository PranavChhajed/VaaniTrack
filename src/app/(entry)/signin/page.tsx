"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { requestCode, verifyCode } from "@/lib/auth";
import { EMAIL_RE, HeadingAccent, inputClass } from "../shared";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    const result = sent ? await verifyCode(email, code) : await requestCode(email);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    if (sent) router.push("/app"); else setSent(true);
  }
  return <div className="rounded-[var(--radius-card)] border-2 border-vast-ink bg-paper-raised p-6">
    <Logo size={48} />
    <h1 className="display-type mt-4 text-heading-sm">Your account</h1><HeadingAccent />
    <p className="my-4">Optional, invite-only cloud sync. You can keep recording without an account.</p>
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label>Email<input className={inputClass} type="email" autoComplete="email" required disabled={sent || busy} value={email} onChange={e => setEmail(e.target.value)} /></label>
      {sent && <label>Email code<input className={inputClass} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" required value={code} onChange={e => setCode(e.target.value)} /></label>}
      {error && <p role="alert">{error}</p>}
      <button className="focus-ring rounded-xl border-2 border-vast-ink bg-mint-whisper p-4" disabled={busy || !EMAIL_RE.test(email)}>{busy ? "Please wait…" : sent ? "Verify code" : "Email me a code"}</button>
      {sent && <button type="button" disabled={busy} onClick={() => { setSent(false); setCode(""); }}>Change email or request another code</button>}
    </form>
    <p className="my-4 text-sm">Your existing expenses stay on this device until you choose to import them.</p>
    <Link className="underline" href="/app">Continue without an account</Link>
  </div>;
}

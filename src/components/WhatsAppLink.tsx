"use client";
import { useCallback, useEffect, useState } from "react";
import { loadSettings } from "@/lib/settings";

export function WhatsAppLink({ accountId }: { accountId: string }) {
  const [linked, setLinked] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [available, setAvailable] = useState(false);
  const [reviewAll, setReviewAll] = useState(true);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/account/whatsapp", { cache: "no-store", headers: { "X-Vaani-Account": accountId } });
      if (!response.ok) return;
      const result = await response.json();
      setAvailable(true); setLinked(result.linked); setPending(result.pending);
      setPendingId(result.pendingId);
    } catch { /* An optional channel never blocks the journal. */ }
  }, [accountId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!url) return;
    const interval = setInterval(refresh, 6000);
    return () => clearInterval(interval);
  }, [url, refresh]);
  async function action(action: string) {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/account/whatsapp", { method: "POST", headers: { "Content-Type": "application/json", "X-Vaani-Account": accountId },
        body: JSON.stringify({ action, pendingId, reviewAll: reviewAll || loadSettings().reviewAll }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Couldn't update WhatsApp");
      setUrl(result.url ?? "");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Couldn't connect"); }
    finally { setBusy(false); }
  }
  if (!available) return null;
  return <details className="mt-3">
    <summary>WhatsApp expenses {linked ? `· ${linked}` : "· optional beta"}</summary>
    <p className="my-2">Send text or a short voice note to the VaaniTrack test number. Voice notes are processed by Meta and our speech provider; temporary audio is deleted after processing.</p>
    {linked ? <button disabled={busy} className="underline p-2" onClick={() => action("unlink")}>Unlink {linked}</button> : <>
      <label className="block my-2"><input type="checkbox" checked={reviewAll} onChange={e => setReviewAll(e.target.checked)} /> Review every WhatsApp expense before saving</label>
      <button disabled={busy} className="underline p-2" onClick={() => action("start")}>Create a 10-minute linking message</button>
      {url && <a className="block underline p-2" href={url} target="_blank" rel="noopener noreferrer">Open WhatsApp and send the linking message</a>}
      {pending && <button disabled={busy} className="underline p-2" onClick={() => action("confirm")}>Confirm that {pending} is my number</button>}
    </>}
    {notice && <p role="alert">{notice}</p>}
  </details>;
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PortalLogin } from "@/components/PortalLogin";
import { useLabRecorder } from "./useLabRecorder";
import cases from "../../../qa/voice-cases.json";
import extra from "../../../qa/voice-cases-extra.json";

/**
 * The voice lab: where the labelled test set gets recorded.
 *
 * Read the line on screen the way you would say it, in the condition chosen, and
 * the take is filed under that line. Scores for any later change are measured on
 * these recordings, so how they are made matters more than how many there are:
 * say each line naturally, in the place the condition names, on the phone it is
 * meant for. Behind the portal password; not linked from the app.
 */

type Line = { id: string; text: string; group: string };

const LINES: Line[] = [
  ...(cases as { id: number; utterance: string; group: string }[]).map((c) => ({
    id: `c${c.id}`, text: c.utterance, group: c.group,
  })),
  ...(extra as { id: string; utterance: string; group: string }[]).map((c) => ({
    id: c.id, text: c.utterance, group: c.group,
  })),
];

const CONDITIONS = [
  { id: "quiet", label: "Quiet", hint: "A quiet room. Hold the phone as you normally would." },
  { id: "noisy", label: "Noisy", hint: "With a TV, a fan, traffic or people talking nearby." },
  { id: "moving", label: "Moving", hint: "Walking, or in a vehicle, one-handed, phone at arm's length." },
  { id: "fast", label: "Fast", hint: "Say it quickly, the way you do when you are in a hurry." },
  { id: "mumbled", label: "Mumbled", hint: "Low and unclear, as if you were half-speaking to yourself." },
] as const;
type Condition = (typeof CONDITIONS)[number]["id"];

const today = () => new Date().toISOString().slice(0, 10);

export default function LabPage() {
  const [auth, setAuth] = useState<"checking" | "yes" | "no">("checking");
  const [stored, setStored] = useState<string[]>([]);
  const [session, setSession] = useState(() => `s-${today()}`);
  const [condition, setCondition] = useState<Condition>("quiet");
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const recorder = useLabRecorder();
  const [ready, setReady] = useState(false);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (): Promise<{ ok: boolean; takes: string[] }> => {
    const res = await fetch("/api/lab").catch(() => null);
    if (!res || res.status === 401) return { ok: false, takes: [] };
    const body = (await res.json().catch(() => ({ takes: [] }))) as { takes?: string[] };
    return { ok: true, takes: body.takes ?? [] };
  }, []);
  const apply = (r: { ok: boolean; takes: string[] }) => {
    setStored(r.takes);
    setAuth(r.ok ? "yes" : "no");
  };
  const refresh = async () => apply(await load());
  useEffect(() => {
    let live = true;
    void load().then((r) => { if (live) apply(r); });
    return () => { live = false; };
  }, [load]);
  useEffect(() => () => { if (advance.current) clearTimeout(advance.current); }, []);

  const doneFor = useMemo(() => {
    const done = new Set<string>();
    for (const name of stored) {
      const m = /^([a-z0-9-]+)\/([a-z0-9]+)__([a-z]+)__\d\./.exec(name);
      if (m && m[1] === session && m[3] === condition) done.add(m[2]);
    }
    return done;
  }, [stored, session, condition]);

  const line = LINES[index];
  const nextUndone = () => {
    for (let k = 1; k <= LINES.length; k++) {
      const i = (index + k) % LINES.length;
      if (!doneFor.has(LINES[i].id)) return i;
    }
    return index;
  };

  const toggle = async () => {
    if (busy) return;
    setNote(null);
    if (recorder.state === "idle") {
      setReady(false);
      await recorder.start();
      // Give the microphone a moment to carry sound before saying "speak now".
      setTimeout(() => setReady(true), 700);
      return;
    }
    if (recorder.state !== "recording") return;
    setBusy(true);
    const takes = await recorder.stop();
    const take = Math.min(9, 1 + new Set(
      stored.filter((n) => n.startsWith(`${session}/${line.id}__${condition}__`)).map((n) => n.split("__")[2]),
    ).size);
    let failed: string | null = null;
    for (const t of takes) {
      if (t.blob.size < 800) { failed = "That take had no sound. Check the microphone and say it again."; break; }
      const form = new FormData();
      form.append("audio", t.blob, "take");
      form.append("session", session);
      form.append("line", line.id);
      form.append("condition", condition);
      form.append("take", String(take));
      form.append("variant", t.variant);
      const res = await fetch("/api/lab", { method: "POST", body: form }).catch(() => null);
      if (!res || !res.ok) {
        const msg = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : null;
        failed = msg ?? "Could not save that take. Check the connection and say it again.";
        break;
      }
    }
    if (failed) { setNote(failed); setBusy(false); return; }
    const level = takes[0]?.meanDb ?? null;
    setNote(level !== null && level < -42 ? "Saved, but it was very quiet. Fine if that is what you meant." : "Saved.");
    await refresh();
    setBusy(false);
    advance.current = setTimeout(() => { setIndex(nextUndone()); setNote(null); }, 700);
  };

  if (auth === "checking") return <p className="p-8 font-figtree text-body text-fog">Checking…</p>;
  if (auth === "no") return <PortalLogin />;

  const cond = CONDITIONS.find((c) => c.id === condition)!;
  const live = recorder.state === "recording";
  const label = busy ? "Saving…" : recorder.state === "starting" ? "Getting the mic ready…" : recorder.state === "recording" ? (ready ? "Speak now, then tap to finish" : "Getting the mic ready…") : "Tap, then say the line";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col gap-6 px-5 pb-16 pt-8">
      <header>
        <h1 className="display-type text-heading-sm text-vast-ink">Voice lab</h1>
        <p className="mt-1 font-figtree text-body-sm text-charcoal">
          {doneFor.size} of {LINES.length} lines recorded for <strong>{cond.label}</strong> in session {session}.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Condition">
        {CONDITIONS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={condition === c.id}
            onClick={() => setCondition(c.id)}
            className={`focus-ring rounded-[var(--radius-pill)] border-2 border-vast-ink px-4 py-2 font-figtree text-body-sm ${condition === c.id ? "bg-vast-ink text-paper" : "bg-paper text-vast-ink"}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <p className="font-figtree text-caption text-charcoal">{cond.hint}</p>

      <section aria-live="polite" className="rounded-[var(--radius-card)] border-2 border-vast-ink bg-paper-raised px-6 py-8">
        <p className="font-figtree text-caption uppercase tracking-[0.08em] text-fog">
          Line {index + 1} of {LINES.length} · {line.group}{doneFor.has(line.id) ? " · recorded" : ""}
        </p>
        <p className="mt-3 font-figtree text-subheading font-medium text-vast-ink">“{line.text}”</p>
      </section>

      <button
        type="button"
        onClick={toggle}
        disabled={busy || recorder.state === "starting" || recorder.state === "denied"}
        className={`focus-ring rounded-[var(--radius-pill)] border-2 border-vast-ink px-6 py-5 font-figtree text-body font-medium text-vast-ink ${live ? "bg-ember-glow" : "bg-mint-whisper"} disabled:opacity-60`}
      >
        {label}
      </button>
      {recorder.error ? <p role="alert" className="font-figtree text-body-sm text-vast-ink">{recorder.error}</p> : null}
      {note ? <p role="status" className="font-figtree text-body-sm text-charcoal">{note}</p> : null}

      <nav className="flex flex-wrap items-center gap-4 font-figtree text-body-sm" aria-label="Lines">
        <button type="button" onClick={() => setIndex((index + LINES.length - 1) % LINES.length)} className="focus-ring underline underline-offset-4">Previous</button>
        <button type="button" onClick={() => setIndex((index + 1) % LINES.length)} className="focus-ring underline underline-offset-4">Skip</button>
        <button type="button" onClick={() => setIndex(nextUndone())} className="focus-ring underline underline-offset-4">Next unrecorded</button>
      </nav>

      <label className="flex flex-col gap-1 font-figtree text-caption text-charcoal">
        Session name (lowercase letters, numbers and dashes)
        <input
          value={session}
          onChange={(e) => setSession(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40))}
          className="focus-ring rounded-[var(--radius-input)] border-2 border-vast-ink bg-paper px-3 py-2 text-body-sm text-vast-ink"
        />
      </label>
    </main>
  );
}

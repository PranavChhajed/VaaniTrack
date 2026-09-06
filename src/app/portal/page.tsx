import Link from "next/link";
import { PortalLogin } from "@/components/PortalLogin";
import { isAuthorised } from "@/lib/portalAuth";
import { getCapture, listCaptures } from "@/lib/observe";

export const dynamic = "force-dynamic";

/**
 * The diagnostic portal.
 *
 * Not an analytics dashboard. It answers exactly one question, for one capture
 * at a time: **why did this particular expense come out wrong?**
 *
 * Everything on this page exists to separate the pipeline stages from each
 * other, because "the transaction is wrong" is not actionable and "the
 * transcript was right but the extractor read 250 as 2050" is.
 */

type CaptureRow = {
  id: string;
  created_at: string;
  source: string;
  transcript: string | null;
  asr_verdict: string | null;
  avg_logprob: number | null;
  extract_error: string | null;
  transactions: {
    idx: number;
    extracted: Record<string, unknown> | null;
    outcome: string;
    failed: string[] | null;
  }[];
};

/**
 * Where the pipeline most likely broke.
 *
 * A heuristic, and labelled as one on screen — it narrows the search, it does
 * not close the case. The ordering matters: a stage can only be blamed once
 * everything upstream of it is known to have worked.
 */
function likelyFailure(row: {
  asr_verdict: string | null;
  extract_error: string | null;
  transactions: { outcome: string; failed: string[] | null }[];
  events?: { action: string }[];
}): { label: string; tone: "ok" | "warn" | "bad" } {
  if (row.asr_verdict === "rejected_too_small")
    return { label: "Recording too short — mis-tap", tone: "warn" };
  if (row.asr_verdict === "rejected_no_speech")
    return { label: "Audio — no speech detected", tone: "warn" };
  if (row.asr_verdict === "rejected_denylist")
    return { label: "ASR — returned a stock hallucination", tone: "bad" };
  if (row.asr_verdict === "rejected_no_amount")
    return { label: "ASR or speaker — no amount in the transcript", tone: "warn" };
  if (row.extract_error)
    return { label: `Extraction — ${row.extract_error}`, tone: "bad" };

  const undone = row.events?.some((e) => e.action === "undone");
  const discarded = row.events?.some((e) => e.action === "review_discarded");
  const edited = row.events?.some((e) => e.action === "edited");

  // An auto-save the user immediately undid is the worst outcome the product
  // has: the gate was confident and wrong.
  if (undone) return { label: "Gate — auto-saved something wrong", tone: "bad" };
  if (discarded) return { label: "Extraction — proposal rejected", tone: "bad" };
  if (edited) return { label: "Extraction — user corrected a field", tone: "warn" };

  const reviewed = row.transactions.some((t) => t.outcome === "review");
  if (reviewed) return { label: "Sent to review", tone: "warn" };
  return { label: "Clean", tone: "ok" };
}

const TONE: Record<string, string> = {
  ok: "text-forest-ink",
  warn: "text-vast-ink",
  bad: "text-vast-ink font-semibold",
};

function amountOf(extracted: Record<string, unknown> | null): string {
  const a = extracted?.amount;
  return typeof a === "number" ? `₹${a.toLocaleString("en-IN")}` : "—";
}

export default async function Portal({
  searchParams,
}: {
  searchParams: Promise<{ capture?: string }>;
}) {
  if (!(await isAuthorised())) return <PortalLogin />;

  const { capture: captureId } = await searchParams;

  if (captureId) {
    const detail = await getCapture(captureId);
    if (!detail) {
      return (
        <main className="mx-auto w-full max-w-[760px] px-5 py-10">
          <Link href="/portal" className="font-figtree text-body-sm underline">
            &lsaquo; All captures
          </Link>
          <p className="mt-6 font-figtree text-body">Capture not found.</p>
        </main>
      );
    }

    const c = detail.capture as Record<string, unknown>;
    const verdict = likelyFailure({
      asr_verdict: c.asr_verdict as string | null,
      extract_error: c.extract_error as string | null,
      transactions: detail.transactions as unknown as {
        outcome: string;
        failed: string[] | null;
      }[],
      events: detail.events as unknown as { action: string }[],
    });

    return (
      <main className="mx-auto w-full max-w-[760px] px-5 py-10">
        <Link href="/portal" className="font-figtree text-body-sm underline underline-offset-4">
          &lsaquo; All captures
        </Link>

        <h1 className="display-type mt-6 text-heading-sm text-vast-ink">
          Capture {String(c.id).slice(0, 8)}
        </h1>
        <p className={`mt-2 font-figtree text-body ${TONE[verdict.tone]}`}>
          Likely failure: {verdict.label}
          <span className="ml-2 text-caption text-fog">(heuristic)</span>
        </p>

        <Stage title="1 · Audio">
          <Row k="Source" v={String(c.source)} />
          <Row k="Size" v={c.audio_bytes ? `${Math.round(Number(c.audio_bytes) / 1024)} KB` : "—"} />
          <Row k="Duration" v={c.audio_ms ? `${Number(c.audio_ms)} ms` : "—"} />
          <Row k="Recording kept" v={c.audio_stored ? "yes" : "no"} />
        </Stage>

        <Stage title="2 · Transcription">
          <Row k="Model" v={(c.asr_model as string) ?? "—"} />
          <Row k="Verdict" v={(c.asr_verdict as string) ?? "—"} />
          <Row k="Transcript" v={c.transcript ? `“${c.transcript}”` : "—"} />
          {/* Negative by nature. About -0.27 on a clean capture; the gate's
              threshold is -0.9. Not a 0-1 probability. */}
          <Row k="avg_logprob" v={c.avg_logprob === null ? "—" : String(c.avg_logprob)} />
          <Row k="no_speech_prob" v={c.no_speech_prob === null ? "—" : String(c.no_speech_prob)} />
        </Stage>

        <Stage title="3 · Extraction">
          <Row k="Model" v={(c.extract_model as string) ?? "—"} />
          <Row k="Took" v={c.extract_ms ? `${Number(c.extract_ms)} ms` : "—"} />
          <Row k="Error" v={(c.extract_error as string) ?? "none"} />
          {c.extract_raw ? (
            <pre className="mt-3 overflow-x-auto rounded-[var(--radius-input)] border-2 border-paper-edge bg-paper-raised p-4 font-mono text-caption text-vast-ink">
              {JSON.stringify(c.extract_raw, null, 2)}
            </pre>
          ) : null}
        </Stage>

        <Stage title="4 · Confidence gate">
          {detail.transactions.length === 0 ? (
            <p className="font-figtree text-body-sm text-fog">No transactions produced.</p>
          ) : (
            detail.transactions.map((t) => {
              const row = t as unknown as {
                idx: number;
                extracted: Record<string, unknown> | null;
                gate_outcome: string;
                gate_failed: string[] | null;
              };
              return (
                <div key={row.idx} className="border-b border-paper-edge py-3 last:border-b-0">
                  <p className="font-figtree text-body-sm text-vast-ink">
                    #{row.idx} {amountOf(row.extracted)} &middot;{" "}
                    {String(row.extracted?.description ?? "—")} &middot;{" "}
                    <strong>{row.gate_outcome}</strong>
                  </p>
                  {/* The whole reason this table exists: not that it went to
                      review, but which condition sent it there. */}
                  {row.gate_failed && row.gate_failed.length > 0 ? (
                    <p className="mt-1 font-figtree text-caption text-fog">
                      blocked by: {row.gate_failed.join(", ")}
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </Stage>

        <Stage title="5 · What the user did">
          {detail.events.length === 0 ? (
            <p className="font-figtree text-body-sm text-fog">Nothing yet.</p>
          ) : (
            detail.events.map((e) => {
              const ev = e as unknown as {
                id: string;
                action: string;
                at: string;
                changed_fields: string[] | null;
              };
              return (
                <div key={ev.id} className="border-b border-paper-edge py-3 last:border-b-0">
                  <p className="font-figtree text-body-sm text-vast-ink">
                    <strong>{ev.action}</strong>
                    <span className="ml-2 text-fog">
                      {new Date(ev.at).toLocaleString()}
                    </span>
                  </p>
                  {ev.changed_fields?.length ? (
                    <p className="mt-1 font-figtree text-caption text-fog">
                      changed: {ev.changed_fields.join(", ")}
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </Stage>
      </main>
    );
  }

  const rows = (await listCaptures(100)) as unknown as CaptureRow[];

  return (
    <main className="mx-auto w-full max-w-[900px] px-5 py-10">
      <h1 className="display-type text-heading-sm text-vast-ink">Captures</h1>
      <p className="mt-2 font-figtree text-body-sm text-fog">
        {rows.length} most recent. Tap one to see where its pipeline went.
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 font-figtree text-body text-fog">
          Nothing recorded yet. Speak an expense and it will appear here.
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full border-collapse font-figtree text-body-sm">
            <thead>
              <tr className="border-b-2 border-vast-ink text-left">
                <Th>Time</Th>
                <Th>Transcript</Th>
                <Th>Extracted</Th>
                <Th>Likely failure</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const verdict = likelyFailure(r);
                return (
                  <tr key={r.id} className="border-b border-paper-edge align-top">
                    <td className="py-3 pr-4 whitespace-nowrap text-fog">
                      {new Date(r.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/portal?capture=${r.id}`}
                        className="underline underline-offset-4"
                      >
                        {r.transcript ? `“${r.transcript}”` : <em className="text-fog">no transcript</em>}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 money whitespace-nowrap">
                      {r.transactions.length === 0
                        ? "—"
                        : r.transactions.map((t) => amountOf(t.extracted)).join(" · ")}
                    </td>
                    <td className={`py-3 ${TONE[verdict.tone]}`}>{verdict.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="pb-2 pr-4 font-figtree text-caption font-semibold uppercase tracking-[0.08em] text-fog">
      {children}
    </th>
  );
}

function Stage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-[var(--radius-card)] border-2 border-vast-ink bg-paper-raised px-6 py-5">
      <h2 className="font-figtree text-caption font-semibold uppercase tracking-[0.08em] text-fog">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-3 border-b border-paper-edge py-2 last:border-b-0">
      <span className="font-figtree text-body-sm text-fog">{k}</span>
      <span className="font-figtree text-body-sm text-vast-ink">{v}</span>
    </div>
  );
}

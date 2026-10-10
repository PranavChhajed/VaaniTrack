"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { todayISO } from "@/lib/journal";

/**
 * Device diagnostics.
 *
 * There is no devtools on a phone, and guessing from server logs has already
 * cost a round of wrong conclusions. This page walks the capture path one step
 * at a time and prints the result of each on screen, so a failure names itself
 * instead of looking like "it doesn't work".
 */

type Line = { label: string; value: string; ok: boolean | null };

/**
 * What this browser offers the capture path. Read once and kept: the answer
 * cannot change while the page is open, and a stable object is what lets
 * React treat it as an external snapshot instead of something to copy into
 * state from an effect.
 */
let probed: Line[] | null = null;
function probeEnvironment(): Line[] {
  if (probed) return probed;
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  const supported =
    typeof MediaRecorder === "undefined"
      ? []
      : types.filter((t) => {
          try {
            return MediaRecorder.isTypeSupported(t);
          } catch {
            return false;
          }
        });

  const lines: Line[] = [
    {
      label: "Page URL",
      value: `${location.protocol}//${location.host}`,
      ok: null,
    },
    {
      label: "Secure context",
      value: String(window.isSecureContext),
      ok: window.isSecureContext,
    },
    {
      label: "navigator.mediaDevices",
      value: navigator.mediaDevices ? "present" : "MISSING",
      ok: Boolean(navigator.mediaDevices),
    },
    {
      label: "getUserMedia",
      value:
        typeof navigator.mediaDevices?.getUserMedia === "function"
          ? "present"
          : "MISSING",
      ok: typeof navigator.mediaDevices?.getUserMedia === "function",
    },
    {
      label: "MediaRecorder",
      value: typeof MediaRecorder === "undefined" ? "MISSING" : "present",
      ok: typeof MediaRecorder !== "undefined",
    },
    {
      label: "Supported audio types",
      value: supported.length ? supported.join(", ") : "NONE",
      ok: supported.length > 0,
    },
    { label: "Browser", value: navigator.userAgent, ok: null },
  ];
  probed = lines;
  return lines;
}

const NO_LINES: Line[] = [];
const noSubscription = () => () => {};

export default function Diag() {
  const env = useSyncExternalStore(noSubscription, probeEnvironment, () => NO_LINES);
  const [log, setLog] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);

  const say = (s: string) =>
    setLog((prev) => [...prev, `${new Date().toLocaleTimeString()}  ${s}`]);

  const step1 = async () => {
    say("① asking for microphone permission…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      say(`✓ permission granted, track: "${track?.label || "unnamed"}"`);
      say(`  track state: ${track?.readyState}, enabled: ${track?.enabled}`);
    } catch (e) {
      const err = e as Error;
      say(`✗ FAILED: ${err.name}: ${err.message}`);
    }
  };

  const step2 = async () => {
    const stream = streamRef.current;
    if (!stream) return say("✗ run step 1 first");
    say("② recording for 3 seconds, say “two fifty lunch” now…");
    try {
      const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mime = types.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recRef.current = rec;
      chunksRef.current = [];
      const started = Date.now();

      rec.ondataavailable = (e) => {
        say(`  chunk: ${e.data.size} bytes`);
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onerror = () => say("✗ recorder error fired");
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || mime || "audio/webm",
        });
        blobRef.current = blob;
        setRecording(false);
        say(
          `✓ stopped after ${Date.now() - started}ms, ${blob.size} bytes, type ${blob.type || "?"}`,
        );
        if (blob.size === 0) say("✗ ZERO BYTES: this is the failure.");
      };

      rec.start(200);
      setRecording(true);
      say(`  started, mimeType = ${rec.mimeType || mime || "default"}`);
      setTimeout(() => {
        if (rec.state !== "inactive") rec.stop();
      }, 3000);
    } catch (e) {
      setRecording(false);
      say(`✗ FAILED: ${(e as Error).message}`);
    }
  };

  const step3 = async () => {
    const blob = blobRef.current;
    if (!blob || blob.size === 0) return say("✗ no audio from step 2");
    say(`③ uploading ${blob.size} bytes…`);
    try {
      const form = new FormData();
      form.append("audio", blob, "capture");
      form.append("today", todayISO());
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      // A capture that was heard answers in two lines of JSON, what was heard
      // and then the result; a rejection answers in one. The last line is the
      // whole answer either way.
      const lines = (await res.text()).trim().split("\n");
      const json = JSON.parse(lines[lines.length - 1]);
      if (res.ok) {
        say(`✓ transcribed: “${json.text}”`);
        const rows = json.transactions ?? [];
        say(
          rows.length
            ? `✓ extracted: ${rows.map((r: { amount: number; description: string }) => `₹${r.amount} ${r.description}`).join(", ")}`
            : `✗ extracted nothing from “${json.text}”${json.extractError ? `: ${json.extractError}` : ""}`,
        );
      } else {
        say(`✗ ${res.status}: ${json.error} ${JSON.stringify(json.debug ?? {})}`);
      }
    } catch (e) {
      say(`✗ upload failed: ${(e as Error).message}`);
    }
  };

  const btn =
    "w-full rounded-[12px] border-2 border-vast-ink bg-mint-whisper px-5 py-4 font-figtree text-body-sm font-medium text-vast-ink active:bg-mint-deep disabled:opacity-50";

  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-5 py-8">
      <h1 className="display-type text-heading-sm text-vast-ink">
        Capture diagnostics
      </h1>

      <section className="rounded-[32px] border-2 border-vast-ink bg-paper-raised p-5">
        {env.map((line) => (
          <div
            key={line.label}
            className="flex flex-col gap-1 border-t-2 border-paper-edge py-3 first:border-t-0 first:pt-0"
          >
            <span className="font-figtree text-caption font-medium text-fog">
              {line.label}
            </span>
            <span
              className={[
                "break-all font-figtree text-body-sm",
                line.ok === false ? "text-alert" : "text-vast-ink",
              ].join(" ")}
            >
              {line.ok === true ? "✓ " : line.ok === false ? "✗ " : ""}
              {line.value}
            </span>
          </div>
        ))}
      </section>

      <div className="flex flex-col gap-3">
        <button className={btn} onClick={step1}>
          ① Ask for microphone
        </button>
        <button className={btn} onClick={step2} disabled={recording}>
          {recording ? "Recording… speak now" : "② Record 3 seconds"}
        </button>
        <button className={btn} onClick={step3}>
          ③ Send it to the server
        </button>
      </div>

      <section className="rounded-[32px] bg-vast-ink p-5">
        <p className="mb-3 font-figtree text-caption font-medium text-haze">
          Output
        </p>
        {log.length === 0 ? (
          <p className="font-figtree text-body-sm text-haze">
            Tap the buttons in order.
          </p>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-paper">
            {log.join("\n")}
          </pre>
        )}
      </section>

      <a
        href="/app"
        className="text-center font-figtree text-body-sm text-fog underline underline-offset-4"
      >
        back to VaaniTrack
      </a>
    </main>
  );
}

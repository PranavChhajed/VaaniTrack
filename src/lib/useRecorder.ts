"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "requesting" | "recording" | "denied";

export type RecorderResult =
  | { ok: true; blob: Blob; mimeType: string; ms: number }
  | { ok: false; reason: string };

/** Safari (including iOS) cannot produce webm; it records mp4/aac. Chrome and
 *  Firefox prefer webm/opus. Ask the browser rather than sniffing the UA. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

/** Below this, the user tapped twice by accident rather than saying anything. */
const MIN_MS = 400;

export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const resolveRef = useRef<((r: RecorderResult) => void) | null>(null);
  const startedAtRef = useRef(0);

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(async () => {
    setError(null);

    // getUserMedia exists only in a secure context: HTTPS with a certificate
    // the browser actually trusts, or localhost. Note that tapping through a
    // certificate warning does NOT produce a secure context in Chrome — the
    // page loads and this stays undefined.
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      const insecure =
        typeof window !== "undefined" &&
        window.location.protocol !== "https:" &&
        !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      setState("denied");
      setError(
        insecure
          ? `Microphone needs HTTPS. This page is on ${window.location.protocol}//${window.location.hostname} — open the https:// link instead.`
          : "This browser will not give the page a microphone. Try Chrome or Safari.",
      );
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setState("denied");
      setError("This browser has no MediaRecorder. iOS needs version 14.3 or newer.");
      return;
    }

    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Drive the bars from real input, so the animation tells the user
      // something true about whether the mic is hearing them.
      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new Ctx();
        // iOS starts contexts suspended. Do NOT await resume() here: the user
        // gesture has already been spent on getUserMedia, and on iOS the
        // promise can then hang forever — which would leave start() pending
        // and the button stuck in "requesting" with no error and no recording.
        // The meter is cosmetic; recording must not wait on it.
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
          setLevel(Math.min(1, peak / 64));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // Visualisation is a nicety; recording works without it.
      }

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        teardown();
        setState("idle");
        resolveRef.current?.({ ok: false, reason: "The recorder stopped unexpectedly." });
        resolveRef.current = null;
      };

      recorder.onstop = () => {
        const ms = Date.now() - startedAtRef.current;
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        teardown();
        setState("idle");

        const resolve = resolveRef.current;
        resolveRef.current = null;
        if (!resolve) return;

        if (blob.size === 0) {
          resolve({
            ok: false,
            reason:
              "No audio was captured. Check that this tab has microphone access, then try again.",
          });
        } else if (ms < MIN_MS) {
          resolve({
            ok: false,
            reason: "That was too quick — hold on a moment while you speak.",
          });
        } else {
          resolve({ ok: true, blob, mimeType: type, ms });
        }
      };

      // A timeslice matters: without it Safari may deliver nothing until the
      // recorder is torn down, and on some builds nothing at all. Asking for
      // data every 200ms makes delivery predictable everywhere.
      startedAtRef.current = Date.now();
      recorder.start(200);
      recorderRef.current = recorder;
      setState("recording");
    } catch (err) {
      teardown();
      setState("denied");
      const name = err instanceof Error ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "Microphone permission was refused. Allow it for this site and try again."
          : name === "NotFoundError"
            ? "No microphone was found on this device."
            : `Could not start the microphone${name ? ` (${name})` : ""}.`,
      );
    }
  }, [teardown]);

  const stop = useCallback((): Promise<RecorderResult> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return Promise.resolve({ ok: false, reason: "Nothing was recording." });
    }
    return new Promise((resolve) => {
      resolveRef.current = resolve;

      // If onstop never fires — which happens on some mobile builds — resolve
      // anyway rather than leaving the caller awaiting forever behind a
      // "Working…" button.
      const guard = setTimeout(() => {
        if (!resolveRef.current) return;
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        resolveRef.current = null;
        teardown();
        setState("idle");
        resolve(
          blob.size > 0
            ? { ok: true, blob, mimeType: blob.type, ms: Date.now() - startedAtRef.current }
            : { ok: false, reason: "The recorder never returned any audio." },
        );
      }, 3000);

      const original = resolveRef.current;
      resolveRef.current = (r) => {
        clearTimeout(guard);
        original?.(r);
      };

      // stop() flushes a final dataavailable on its own; calling requestData()
      // first can produce an extra empty chunk on some implementations.
      recorder.stop();
    });
  }, []);

  return { state, error, level, start, stop };
}

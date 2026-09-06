"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "requesting" | "recording" | "denied";

export type RecorderResult =
  | {
      ok: true;
      blob: Blob;
      mimeType: string;
      ms: number;
      /** Loudest and average window RMS of the take, in dBFS, or null if the
       *  meter never ran. Negative; 0 is full scale. See SILENT_DB. */
      peakDb: number | null;
      meanDb: number | null;
    }
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

/**
 * Below this peak, nothing audible reached the page at all.
 *
 * Deliberately far below speech. A phone held at arm's length still peaks
 * around -30 dBFS; a quiet room floor sits near -50. This only fires on a
 * stream that is essentially digital silence, which is a real state that has
 * happened here: a recording of normal length and normal byte count measuring
 * -77 to -103 dBFS end to end. Byte count cannot see that, because Opus encodes
 * silence at the same fixed bitrate as speech, so the recording looked healthy
 * all the way to the transcriber, which then invented "Thank you."
 *
 * The threshold is set to catch only the unambiguous case. Audio that is merely
 * too quiet is still sent; the server, which can see the whole take, decides.
 */
const SILENT_DB = -55;

function dbOf(rms: number): number {
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

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
  // Accumulated by the level meter. The meter was already reading the stream
  // for the animation; keeping the numbers costs nothing and is the only way
  // the app can tell a silent take from a spoken one before it pays for a
  // transcription and shows the user whatever the model invented.
  const peakRef = useRef(0);
  const sumRef = useRef(0);
  const framesRef = useRef(0);

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
      // Plain `audio: true`, not { echoCancellation, noiseSuppression,
      // autoGainControl }. Those constraints were the difference between this
      // path and the diagnostics page's bare getUserMedia call, and the
      // combination — layered with a second live consumer of the same track
      // below — reproduced recordings that ran for a normal duration while
      // carrying almost no audio data, on a real device, while the diag page's
      // plain call captured full-volume speech every time. Duration lied about
      // nothing being wrong; the byte count told the truth.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      chunksRef.current = [];
      peakRef.current = 0;
      sumRef.current = 0;
      framesRef.current = 0;

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

        const measured = framesRef.current > 0;
        const peakDb = measured ? dbOf(peakRef.current) : null;
        const meanDb = measured ? dbOf(sumRef.current / framesRef.current) : null;

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
        } else if (peakDb !== null && peakDb < SILENT_DB) {
          // Caught here rather than at the server because the server sees only
          // a healthy-looking file. Stopping now also spares the user a
          // confident, invented transaction.
          resolve({
            ok: false,
            reason:
              "The microphone sent silence — the recording ran, but no sound reached this page. " +
              "Close any other app using the mic (a call, a voice note), disconnect Bluetooth earphones, " +
              "and make sure nothing is covering the bottom edge of the phone.",
          });
        } else {
          resolve({ ok: true, blob, mimeType: type, ms, peakDb, meanDb });
        }
      };

      // Started before the level meter touches the stream at all — see the
      // note above the getUserMedia call. A timeslice matters too: without
      // one, Safari may deliver nothing until the recorder is torn down, and
      // on some builds nothing at all. Asking for data every 200ms makes
      // delivery predictable everywhere.
      startedAtRef.current = Date.now();
      recorder.start(200);
      recorderRef.current = recorder;
      setState("recording");

      // The level meter, wired up only now that the recorder already has
      // uncontested first claim on the stream. It is a second live consumer of
      // the same track, and on the device this bug was reproduced on, that
      // second consumer existing before the recorder started was enough to
      // starve the encoder while the clock kept running normally — a
      // recording of a completely normal length carrying almost no audio. The
      // meter is cosmetic; it can attach a beat later with no visible cost.
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
        analyser.fftSize = 2048;
        ctx.createMediaStreamSource(stream).connect(analyser);
        // Float, not byte. getByteTimeDomainData quantises to 8 bits, so its
        // floor is around -48 dBFS and it cannot tell a very quiet room from
        // true silence — which is precisely the distinction that matters here.
        const data = new Float32Array(analyser.fftSize);
        const tick = () => {
          analyser.getFloatTimeDomainData(data);
          let sq = 0;
          for (const v of data) sq += v * v;
          const rms = Math.sqrt(sq / data.length);
          peakRef.current = Math.max(peakRef.current, rms);
          sumRef.current += rms;
          framesRef.current += 1;
          setLevel(Math.min(1, rms * 12));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // Visualisation is a nicety; recording works without it.
      }
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
        const measured = framesRef.current > 0;
        resolve(
          blob.size > 0
            ? {
                ok: true,
                blob,
                mimeType: blob.type,
                ms: Date.now() - startedAtRef.current,
                peakDb: measured ? dbOf(peakRef.current) : null,
                meanDb: measured ? dbOf(sumRef.current / framesRef.current) : null,
              }
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

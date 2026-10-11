"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickMimeType } from "@/lib/useRecorder";

/**
 * A recorder for the lab that makes two recordings of one take at the same time.
 *
 *   plain  the microphone exactly as the app records it (getUserMedia({audio:true})
 *          straight into a MediaRecorder).
 *   boost  the same sound through a compressor, +10 dB of make-up gain and a
 *          limiter first, so a quiet voice reaches the transcriber louder.
 *
 * Both hear the same moment of the same speech, so a difference in what the
 * transcriber makes of them is the effect of the processing and nothing else.
 * Reading 150 lines aloud once gives a fair test of whether boosting helps: 40
 * of the 201 real takes in the record were recorded at -40 dB or quieter.
 */

export type LabTake = { variant: "plain" | "boost"; blob: Blob; mimeType: string; peakDb: number | null; meanDb: number | null };

export type LabState = "idle" | "starting" | "recording" | "denied";

function db(rms: number): number | null {
  return rms > 0 ? 20 * Math.log10(rms) : null;
}

export function useLabRecorder() {
  const [state, setState] = useState<LabState>("idle");
  const [error, setError] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const recorders = useRef<{ variant: LabTake["variant"]; rec: MediaRecorder; chunks: Blob[] }[]>([]);
  const meter = useRef<{ node: AnalyserNode; peak: number; sum: number; frames: number; raf: number | null } | null>(null);

  const teardown = useCallback(() => {
    if (meter.current?.raf != null) cancelAnimationFrame(meter.current.raf);
    meter.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close().catch(() => {});
    ctx.current = null;
    recorders.current = [];
  }, []);
  useEffect(() => teardown, [teardown]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser cannot record.");
      return;
    }
    setState("starting");
    try {
      const raw = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = raw;
      const audio = new AudioContext();
      ctx.current = audio;
      const source = audio.createMediaStreamSource(raw);

      const squash = audio.createDynamicsCompressor();
      squash.threshold.value = -50; squash.knee.value = 30; squash.ratio.value = 8;
      squash.attack.value = 0.005; squash.release.value = 0.25;
      const makeup = audio.createGain();
      makeup.gain.value = 3.2; // +10 dB
      const limiter = audio.createDynamicsCompressor();
      limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
      limiter.attack.value = 0.001; limiter.release.value = 0.05;
      const boosted = audio.createMediaStreamDestination();
      source.connect(squash); squash.connect(makeup); makeup.connect(limiter); limiter.connect(boosted);

      // A level reading of the plain signal, for the note shown after a take.
      const analyser = audio.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const m = { node: analyser, peak: 0, sum: 0, frames: 0, raf: null as number | null };
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sq = 0;
        for (const v of buf) sq += v * v;
        const rms = Math.sqrt(sq / buf.length);
        if (rms > 0.0005) { m.peak = Math.max(m.peak, rms); m.sum += rms; m.frames++; }
        m.raf = requestAnimationFrame(tick);
      };
      meter.current = m;
      tick();

      const mimeType = pickMimeType();
      const make = (variant: LabTake["variant"], s: MediaStream) => {
        const rec = new MediaRecorder(s, mimeType ? { mimeType } : undefined);
        const entry = { variant, rec, chunks: [] as Blob[] };
        rec.ondataavailable = (e) => { if (e.data.size > 0) entry.chunks.push(e.data); };
        return entry;
      };
      recorders.current = [make("plain", raw), make("boost", boosted.stream)];
      for (const r of recorders.current) r.rec.start(250);
      setState("recording");
    } catch (e) {
      teardown();
      const name = e instanceof Error ? e.name : "";
      setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "idle");
      setError(name === "NotAllowedError" ? "The microphone is blocked for this site." : "The microphone would not start.");
    }
  }, [teardown]);

  const stop = useCallback(async (): Promise<LabTake[]> => {
    const taken = recorders.current;
    const m = meter.current;
    const peak = m ? db(m.peak) : null;
    const mean = m && m.frames ? db(m.sum / m.frames) : null;
    const done = await Promise.all(
      taken.map(
        (entry) =>
          new Promise<LabTake>((resolve) => {
            entry.rec.onstop = () => {
              const type = entry.rec.mimeType || "audio/webm";
              resolve({ variant: entry.variant, blob: new Blob(entry.chunks, { type }), mimeType: type, peakDb: peak, meanDb: mean });
            };
            try { entry.rec.stop(); } catch { entry.rec.onstop?.(new Event("stop")); }
          }),
      ),
    );
    teardown();
    setState("idle");
    return done;
  }, [teardown]);

  return { state, error, start, stop };
}

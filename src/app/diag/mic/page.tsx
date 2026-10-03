"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Microphone signal test.
 *
 * The capture bug on one device produced recordings of a completely normal
 * length and a completely normal byte count that contained no voice: one 11.8 KB
 * clip measured -77 to -103 dBFS end to end, which is digital silence. Opus here
 * encodes at a fixed target bitrate, so silence costs the same bytes as speech.
 * That is why the byte count could not see this, and why this page measures the
 * signal itself.
 *
 * It runs the same utterance through several getUserMedia configurations and
 * prints, on screen, what actually arrived. On Android the browser's defaults
 * route the microphone through the platform's voice-communication path, and on
 * some handsets that path delivers a flat noise floor or nothing at all. Turning
 * the processing off asks for the raw microphone instead. Which configuration
 * works is a property of the handset, so it has to be measured on the handset.
 */

type Config = { name: string; note: string; constraints: MediaTrackConstraints };

const CONFIGS: Config[] = [
  {
    name: "A · browser defaults",
    note: "audio: true, what the app ships today",
    constraints: {},
  },
  {
    name: "B · all processing off",
    note: "raw microphone, no AEC / NS / AGC",
    constraints: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  },
  {
    name: "C · gain on, AEC off",
    note: "keeps automatic gain, drops the voice-communication path",
    constraints: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: true,
    },
  },
];

const SECONDS = 4;

type Result = {
  config: string;
  note: string;
  label: string;
  settings: string;
  peakDb: number;
  meanDb: number;
  bytes: number;
  verdict: "good" | "weak" | "silent" | "error";
  detail?: string;
};

function dbOf(rms: number): number {
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/** Speech at a sensible distance peaks well above -25 dBFS and has an envelope:
 *  syllables, then gaps. A flat floor below -40 is a room, not a voice. */
function judge(peakDb: number, meanDb: number): Result["verdict"] {
  if (peakDb > -25 && peakDb - meanDb > 6) return "good";
  if (peakDb > -40) return "weak";
  return "silent";
}

export default function MicTest() {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [devices, setDevices] = useState<string[]>([]);
  const [live, setLive] = useState(0);
  const rafRef = useRef<number | null>(null);

  const runOne = useCallback(async (cfg: Config): Promise<Result> => {
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: Object.keys(cfg.constraints).length ? cfg.constraints : true,
      });
      const track = stream.getAudioTracks()[0];
      const s = (track?.getSettings?.() ?? {}) as MediaTrackSettings;

      // Recorded in parallel purely so the byte count sits next to the signal
      // measurement and the two can be compared directly.
      const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mime = types.find((t) => {
        try {
          return MediaRecorder.isTypeSupported(t);
        } catch {
          return false;
        }
      });
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      let bytes = 0;
      rec.ondataavailable = (e) => {
        bytes += e.data.size;
      };
      rec.start(200);

      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new Ctx();
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);
      // Float, not byte: getByteTimeDomainData quantises to 8 bits and cannot
      // tell -50 dBFS from silence, which is the exact distinction this page
      // exists to make.
      const buf = new Float32Array(analyser.fftSize);

      let peak = 0;
      let sum = 0;
      let frames = 0;
      const started = Date.now();

      await new Promise<void>((resolve) => {
        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let sq = 0;
          for (const v of buf) sq += v * v;
          const rms = Math.sqrt(sq / buf.length);
          peak = Math.max(peak, rms);
          sum += rms;
          frames++;
          setLive(Math.min(1, rms * 12));
          const left = SECONDS - Math.floor((Date.now() - started) / 1000);
          setCountdown(left > 0 ? left : 0);
          if (Date.now() - started >= SECONDS * 1000) return resolve();
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      });

      rec.stop();
      await new Promise((r) => setTimeout(r, 300));

      const peakDb = dbOf(peak);
      const meanDb = dbOf(frames ? sum / frames : 0);

      return {
        config: cfg.name,
        note: cfg.note,
        label: track?.label || "unnamed",
        settings: [
          s.deviceId ? `id ${String(s.deviceId).slice(0, 8)}` : null,
          `aec ${String(s.echoCancellation ?? "?")}`,
          `ns ${String(s.noiseSuppression ?? "?")}`,
          `agc ${String(s.autoGainControl ?? "?")}`,
          s.sampleRate ? `${s.sampleRate} Hz` : null,
          s.channelCount ? `${s.channelCount} ch` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        peakDb,
        meanDb,
        bytes,
        verdict: judge(peakDb, meanDb),
      };
    } catch (e) {
      const err = e as Error;
      return {
        config: cfg.name,
        note: cfg.note,
        label: "—",
        settings: "—",
        peakDb: -Infinity,
        meanDb: -Infinity,
        bytes: 0,
        verdict: "error",
        detail: `${err.name}: ${err.message}`,
      };
    } finally {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
      setLive(0);
    }
  }, []);

  const runAll = useCallback(async () => {
    setRunning(true);
    setResults([]);
    setDevices([]);
    try {
      const out: Result[] = [];
      for (const cfg of CONFIGS) {
        setPhase(`${cfg.name}: get ready`);
        await new Promise((r) => setTimeout(r, 1200));
        setPhase(`${cfg.name}: SAY “two fifty for lunch” NOW`);
        const r = await runOne(cfg);
        out.push(r);
        setResults([...out]);
        setPhase(`${cfg.name}: done`);
        await new Promise((r) => setTimeout(r, 600));
      }
      // Labels only come back once permission has been granted, which is why
      // this runs after the recordings rather than before them.
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(
        list
          .filter((d) => d.kind === "audioinput")
          .map((d) => `${d.label || "unnamed"} (${d.deviceId.slice(0, 8)})`),
      );
      setPhase("all tests finished");
    } finally {
      setRunning(false);
      setCountdown(0);
    }
  }, [runOne]);

  return (
    <main className="mx-auto w-full max-w-[560px] px-5 py-8">
      <h1 className="display-type text-heading-sm text-vast-ink">Microphone test</h1>
      <p className="mt-2 font-figtree text-body-sm text-charcoal">
        Three recordings, {SECONDS} seconds each. Say{" "}
        <strong>“two fifty for lunch”</strong> in a normal voice each time,
        holding the phone as you normally would. Do not cover the bottom edge.
      </p>

      <button
        type="button"
        onClick={runAll}
        disabled={running}
        className={[
          "mt-6 w-full rounded-[var(--radius-button)] border-2 border-vast-ink px-5 py-4",
          "font-figtree text-body font-medium text-vast-ink",
          running ? "cursor-not-allowed bg-paper-edge opacity-60" : "bg-mint-whisper",
        ].join(" ")}
      >
        {running ? "Running…" : "Run the test"}
      </button>

      {running ? (
        <div className="mt-5 rounded-[var(--radius-card)] border-2 border-vast-ink bg-ember-glow px-5 py-4">
          <p className="font-figtree text-body font-medium text-vast-ink">{phase}</p>
          {countdown > 0 ? (
            <p className="display-type mt-1 text-heading-sm text-vast-ink">{countdown}</p>
          ) : null}
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full border-2 border-vast-ink bg-paper">
            <div
              className="h-full bg-vast-ink transition-[width] duration-75"
              style={{ width: `${Math.round(live * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {results.map((r) => (
        <section
          key={r.config}
          className="mt-5 rounded-[var(--radius-card)] border-2 border-vast-ink bg-paper-raised px-5 py-4"
        >
          <p className="font-figtree text-body font-semibold text-vast-ink">{r.config}</p>
          <p className="font-figtree text-caption text-fog">{r.note}</p>
          <p
            className={[
              "mt-3 font-figtree text-body font-semibold",
              r.verdict === "good" ? "text-forest-ink" : "text-vast-ink",
            ].join(" ")}
          >
            {r.verdict === "good"
              ? "✓ heard your voice clearly"
              : r.verdict === "weak"
                ? "△ something, but far too quiet"
                : r.verdict === "silent"
                  ? "✗ silence: no voice reached the page"
                  : "✗ could not open the microphone"}
          </p>
          <dl className="mt-3 font-mono text-caption text-vast-ink">
            <Line
              k="peak"
              v={`${r.peakDb === -Infinity ? "−∞" : r.peakDb.toFixed(1)} dBFS`}
            />
            <Line
              k="mean"
              v={`${r.meanDb === -Infinity ? "−∞" : r.meanDb.toFixed(1)} dBFS`}
            />
            <Line k="bytes" v={String(r.bytes)} />
            <Line k="mic" v={r.label} />
            <Line k="applied" v={r.settings} />
            {r.detail ? <Line k="error" v={r.detail} /> : null}
          </dl>
        </section>
      ))}

      {devices.length > 0 ? (
        <section className="mt-5 rounded-[var(--radius-card)] border-2 border-vast-ink bg-paper-raised px-5 py-4">
          <p className="font-figtree text-body font-semibold text-vast-ink">
            Inputs this device offers
          </p>
          <ul className="mt-2 font-mono text-caption text-vast-ink">
            {devices.map((d) => (
              <li key={d} className="border-b border-paper-edge py-1 last:border-b-0">
                {d}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-paper-edge py-1 last:border-b-0">
      <dt className="text-fog">{k}</dt>
      <dd className="break-all text-right">{v}</dd>
    </div>
  );
}

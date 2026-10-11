// Times the real capture route with real recordings.
//
//   npx next dev -p 3100            (in another terminal)
//   VOICE_PIPELINE=v1 ...           (set on that server to time the old route)
//   node scripts/route-timing.mjs [count] [port]
//
// For each stored recording in .captures/replay/audio it posts the audio exactly as the
// app does, reads the streamed reply, and prints when the first line (what was heard) and
// the last (the transactions) arrived, and which route answered. The numbers measure the
// server's two stages plus the local hop; the phone's own network leg is on top.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const count = Number(process.argv[2] ?? 12);
const port = Number(process.argv[3] ?? 3100);
const dir = join(process.cwd(), ".captures", "replay", "audio");
const files = readdirSync(dir).filter((f) => f.endsWith(".webm")).slice(0, count);

const pct = (v, p) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const heardAt = [], doneAt = [];
const routes = {};

for (const f of files) {
  const form = new FormData();
  form.append("audio", new Blob([readFileSync(join(dir, f))], { type: "audio/webm" }), "take.webm");
  form.append("audioMs", "3000");
  form.append("today", new Date().toISOString().slice(0, 10));
  const t0 = performance.now();
  const res = await fetch(`http://localhost:${port}/api/transcribe`, { method: "POST", body: form });
  if (!res.body) { console.log(f.slice(0, 8), res.status, "no body"); continue; }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "", first = null, last = null, lastLine = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      if (first === null) first = performance.now() - t0;
      last = performance.now() - t0; lastLine = line;
    }
  }
  let info = "";
  try {
    const j = JSON.parse(lastLine);
    if (j.transactions) { info = `${j.transactions.length} txn, route ${j.debug?.route}, asr ${j.debug?.asrMs} ms, extract ${j.debug?.extractMs} ms  "${(j.text ?? "").slice(0, 40)}"`; routes[j.debug?.route] = (routes[j.debug?.route] ?? 0) + 1; }
    else info = (j.error ?? j.extractError ?? "no transactions").slice(0, 60);
  } catch { info = `HTTP ${res.status}`; }
  if (first !== null && res.status === 200) { heardAt.push(first); doneAt.push(last); }
  console.log(`${f.slice(0, 8)}  heard ${first?.toFixed(0) ?? "-"} ms   done ${last?.toFixed(0) ?? "-"} ms   ${info}`);
}
console.log(`\n${doneAt.length} answered. heard: p50 ${pct(heardAt, 0.5).toFixed(0)} ms, p95 ${pct(heardAt, 0.95).toFixed(0)} ms.  done: p50 ${pct(doneAt, 0.5).toFixed(0)} ms, p95 ${pct(doneAt, 0.95).toFixed(0)} ms`);
console.log("routes:", routes);

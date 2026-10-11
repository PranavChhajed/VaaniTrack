/**
 * Audio side of the scoreboard: fetch the lab's recordings from storage and run
 * them through the real transcriber. Kept apart from eval.ts only for size.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { transcribeAudio, ASR_MODEL, decoderPrompt, type AsrResult } from "../src/lib/asr.ts";

const BUCKET = "captures";
const CACHE = join(process.cwd(), ".captures", "lab");

export type Take = {
  session: string;
  line: string;
  condition: string;
  take: number;
  variant: string;
  path: string;
  mime: string;
};

const env = () => {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are needed (use --env-file=.env.local)");
  return { base, key };
};

async function list(prefix: string): Promise<{ name: string; id: string | null }[]> {
  const { base, key } = env();
  const res = await fetch(`${base}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
  });
  if (!res.ok) throw new Error(`storage list ${res.status}`);
  return (await res.json()) as { name: string; id: string | null }[];
}

/** Every take of a session, newest take of each (line, condition, variant) only. */
export async function lab(session: string): Promise<Take[]> {
  const entries = await list(`lab/${session}`);
  const latest = new Map<string, Take>();
  for (const e of entries) {
    const m = /^([a-z0-9]+)__([a-z]+)__(\d)__([a-z]+)\.(webm|mp4|ogg)$/.exec(e.name);
    if (!m) continue;
    const t: Take = {
      session, line: m[1], condition: m[2], take: Number(m[3]), variant: m[4],
      path: `lab/${session}/${e.name}`,
      mime: m[5] === "mp4" ? "audio/mp4" : m[5] === "ogg" ? "audio/ogg" : "audio/webm",
    };
    const k = `${t.line}|${t.condition}|${t.variant}`;
    if (!latest.has(k) || latest.get(k)!.take < t.take) latest.set(k, t);
  }
  return [...latest.values()];
}

export async function sessions(): Promise<string[]> {
  return (await list("lab")).filter((e) => e.id === null).map((e) => e.name);
}

async function bytesOf(t: Take): Promise<ArrayBuffer> {
  const file = join(CACHE, t.session, t.path.split("/").pop()!);
  try {
    const b = await readFile(file);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  } catch { /* not cached yet */ }
  const { base, key } = env();
  const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${t.path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`download ${t.path}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(join(CACHE, t.session), { recursive: true });
  await writeFile(file, buf);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A take through the transcriber, cached on the audio itself, the model and the decoder prompt. */
export async function hear(t: Take, apiKey: string, opts: { model?: string; vocab?: string[] } = {}): Promise<{ asr: AsrResult; bytes: number }> {
  const bytes = await bytesOf(t);
  const model = opts.model ?? ASR_MODEL;
  const key = createHash("sha1")
    .update(Buffer.from(bytes)).update(`|${model}|${decoderPrompt(opts.vocab ?? [])}`)
    .digest("hex");
  const file = join(CACHE, "asr", `${key}.json`);
  try { return { asr: JSON.parse(await readFile(file, "utf8")) as AsrResult, bytes: bytes.byteLength }; } catch { /* run it */ }
  let asr: AsrResult | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    asr = await transcribeAudio(bytes, t.mime, { apiKey, model, vocab: opts.vocab });
    if (asr.kind === "error" && asr.status === 429) { await sleep(20_000); continue; }
    break;
  }
  if (!asr) throw new Error("no transcription result");
  if (asr.kind !== "error") {
    await mkdir(join(CACHE, "asr"), { recursive: true });
    await writeFile(file, JSON.stringify(asr));
  }
  return { asr, bytes: bytes.byteLength };
}

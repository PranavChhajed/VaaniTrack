import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { extractTransactions } from "../extract";
import { transcribeAudio } from "../asr";
import type { Incoming } from "./whatsapp";
import type { ParsedCapture } from "./whatsappWorker";
import type { ReplyAction } from "./whatsappWorker";

const run = promisify(execFile);
const MAX_BYTES = 10 * 1024 * 1024;
const MIMES = new Set(["audio/aac", "audio/amr", "audio/mpeg", "audio/mp4", "audio/ogg"]);
function graph() {
  const version = process.env.WHATSAPP_GRAPH_VERSION;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!version || !/^v\d+\.0$/.test(version) || !token) throw new Error("Meta test API not configured");
  return { base: `https://graph.facebook.com/${version}`, headers: { Authorization: `Bearer ${token}` } };
}
export async function readBounded(response: Response) {
  if (!response.ok || Number(response.headers.get("content-length")) > MAX_BYTES || !response.body) throw new Error("media_size_or_fetch");
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { await reader.cancel(); throw new Error("media_size"); }
    parts.push(value);
  }
  if (total === 0) throw new Error("empty_media");
  return Buffer.concat(parts);
}

export async function validateAudio(bytes: Uint8Array) {
  const probe = process.env.WHATSAPP_FFPROBE_PATH;
  const directory = process.env.WHATSAPP_TEMP_DIR;
  if (!probe || !directory || (process.platform === "win32" && /^[cC]:/.test(resolve(directory)))) throw new Error("Audio validation needs a configured temporary directory outside C:");
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new Error("media_size");
  await mkdir(directory, { recursive: true });
  const file = join(resolve(directory), `vaani-${randomUUID()}.audio`);
  try {
    await writeFile(file, bytes, { flag: "wx" });
    const { stdout } = await run(probe, ["-v", "error", "-protocol_whitelist", "file,pipe", "-format_whitelist", "ogg,mov,mp3,aac,amr",
      "-show_entries", "format=duration:stream=codec_type,codec_name", "-of", "json", file], { timeout: 10000, maxBuffer: 65536, windowsHide: true });
    const result = JSON.parse(stdout);
    const duration = Number(result.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 60 || !Array.isArray(result.streams) || result.streams.length !== 1 ||
      result.streams[0].codec_type !== "audio" || !["opus", "vorbis", "aac", "mp3", "amr_nb", "amr_wb"].includes(result.streams[0].codec_name)) throw new Error("media_duration_or_codec");
    return duration;
  } finally { await unlink(file).catch(() => {}); }
}

async function downloadAudio(message: Incoming) {
  const { base, headers } = graph();
  const metadataResponse = await fetch(`${base}/${encodeURIComponent(message.mediaId!)}`, { headers, signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!metadataResponse.ok) throw new Error("media_lookup");
  const metadata = await metadataResponse.json();
  const mime = String(metadata.mime_type ?? "").split(";")[0].trim();
  if (!MIMES.has(mime) || !Number.isFinite(Number(metadata.file_size)) || Number(metadata.file_size) > MAX_BYTES) throw new Error("media_type_or_size");
  const url = new URL(metadata.url);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      !(url.hostname === "lookaside.fbsbx.com" || url.hostname.endsWith(".fbcdn.net"))) throw new Error("untrusted_media_url");
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000), redirect: "error" });
  const bytes = await readBounded(response);
  const hash = createHash("sha256").update(bytes);
  const digest = hash.digest();
  if (metadata.sha256 && metadata.sha256 !== digest.toString("hex") && metadata.sha256 !== digest.toString("base64")) throw new Error("media_hash");
  await validateAudio(bytes);
  return { bytes, mime };
}

export async function whatsappPipeline(message: Incoming): Promise<ParsedCapture> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Speech service not configured");
  let text = message.text ?? "", heardWell = true;
  if (message.type === "audio") {
    const { bytes, mime } = await downloadAudio(message);
    const heard = await transcribeAudio(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, mime, { apiKey });
    if (heard.kind !== "accepted") throw new Error("speech_not_accepted");
    text = heard.text;
    heardWell = heard.avgLogprob !== null && heard.avgLogprob > -0.9;
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(message.timestamp * 1000));
  const extracted = await extractTransactions(text, today, { apiKey });
  if (extracted.kind !== "ok") throw Object.assign(new Error("extraction_failed"), { recoveryText: text });
  return { text, rows: extracted.transactions, heardWell };
}

export async function sendWhatsApp(sender: string, text: string, actions: ReplyAction[] = []) {
  if (process.env.WHATSAPP_SEND_ENABLED !== "1") throw new Error("Sending is disabled");
  if (!(process.env.WHATSAPP_TEST_SENDERS ?? "").split(",").map(s => s.trim()).includes(sender)) throw new Error("Recipient not allowlisted");
  const { base, headers } = graph();
  const phone = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phone || !/^\d+$/.test(phone)) throw new Error("Test phone not configured");
  const content = actions.length && text.length <= 1024
    ? { type: "interactive", interactive: { type: "button", body: { text }, action: { buttons: actions.slice(0, 3).map(action => ({ type: "reply", reply: action })) } } }
    : { type: "text", text: { preview_url: false, body: text } };
  if (text.length > 4000) throw new Error("reply_too_long");
  const response = await fetch(`${base}/${phone}/messages`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: sender, ...content }),
    signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!response.ok) throw new Error("delivery_not_confirmed");
  const result = await response.json();
  if (typeof result.messages?.[0]?.id !== "string") throw new Error("delivery_not_confirmed");
  return result.messages[0].id as string;
}

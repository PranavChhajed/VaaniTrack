import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { validateAudio, readBounded, whatsappPipeline } from "../src/lib/account/whatsappPipeline";

process.env.WHATSAPP_TEMP_DIR = "D:/Personal/VaaniTrack/qa/shots/tmp/whatsapp-audio-test";
process.env.WHATSAPP_FFPROBE_PATH ??= "D:/Personal/VaaniTrack/qa/shots/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffprobe.exe";
process.env.GROQ_API_KEY = "fixture-only";
process.env.WHATSAPP_ACCESS_TOKEN = "fixture-only";
process.env.WHATSAPP_GRAPH_VERSION = "v1.0"; // All calls intercepted, never a real Graph request.
let checks = 0;
function check(value: unknown) { assert.ok(value); checks++; }
async function main() {
  const short = await readFile("qa/shots/verification/wa-short.ogg");
  const long = await readFile("qa/shots/verification/wa-long.ogg");
  check((await validateAudio(short)) < 2);
  for (const bad of [long, Buffer.from("not audio"), Buffer.alloc(0), Buffer.alloc(10 * 1024 * 1024 + 1)]) {
    await assert.rejects(validateAudio(bad)); checks++;
  }
  check((await readdir(process.env.WHATSAPP_TEMP_DIR!)).length === 0);
  await assert.rejects(readBounded(new Response("x", { headers: { "Content-Length": String(11 * 1024 * 1024) } }))); checks++;
  await assert.rejects(readBounded(new Response(Buffer.alloc(11 * 1024 * 1024)))); checks++;
  let malicious = false, silence = false, requests = 0;
  globalThis.fetch = async input => {
    requests++;
    const url = String(input);
    if (url.includes("graph.facebook.com")) return Response.json({ mime_type: "audio/ogg", file_size: short.length,
      url: malicious ? "http://127.0.0.1/private" : "https://lookaside.fbsbx.com/test" });
    if (url.includes("lookaside.fbsbx.com")) return new Response(short);
    if (url.includes("groq.com")) return Response.json(silence ? { text: "", segments: [] } : {
      text: "250 lunch", segments: [{ avg_logprob: -0.2, no_speech_prob: 0.01 }],
    });
    throw new Error("Unexpected network destination");
  };
  const message = { id: "fixture", sender: "fixture", timestamp: Math.floor(Date.now()/1000), type: "audio" as const, mediaId: "123" };
  malicious = true;
  await assert.rejects(whatsappPipeline(message)); checks++;
  check(requests === 1);
  malicious = false; silence = true;
  await assert.rejects(whatsappPipeline(message)); checks++;
  silence = false;
  const result = await whatsappPipeline(message);
  check(result.rows[0].amount === 250 && result.heardWell);
  check((await readdir(process.env.WHATSAPP_TEMP_DIR!)).length === 0);
  console.log(`WhatsApp audio: ${checks} checks passed (synthetic Ogg, real ffprobe, mocked ASR)`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

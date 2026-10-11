// A stand-in for /api/transcribe, so the widget can be tested without a real
// voice or the real transcriber.
//
//   node qa/widget-mock.cjs [port]        (default 4010)
//
// Control it with plain GETs:   /__mode?m=sure|unsure|noamount|silent|error|html|slow|two
//   /__log     what the widget has sent so far (form fields, audio size)
//   /__reset   forget the log
//
// The Android test build points at it with
//   gradlew assembleRelease -PvaaniApi=http://10.0.2.2:4010
// (10.0.2.2 is the emulator's name for this computer).

const http = require("http");

const port = Number(process.argv[2] || 4010);
let mode = "sure";
let log = [];

const today = new Date().toISOString().slice(0, 10);
const row = (over) => ({
  amount: 250, amountProvenance: "said",
  description: "lunch", descriptionProvenance: "said",
  category: null, categoryProvenance: "unknown",
  payee: null, payeeProvenance: "unknown",
  paymentMethod: "UPI", paymentMethodProvenance: "default",
  date: today, dateProvenance: "default",
  time: null, timeProvenance: "unknown",
  needsConfirmation: false, confirmationReason: null,
  ...over,
});

const answers = {
  sure: { text: "250 lunch.", confidence: -0.3, transactions: [row({})] },
  two: {
    text: "250 lunch and 40 chai", confidence: -0.3,
    transactions: [row({}), row({ amount: 40, description: "chai" })],
  },
  unsure: {
    text: "250 to Pushpa", confidence: -0.4,
    transactions: [row({ description: null, descriptionProvenance: "unknown", payee: "Pushpa", payeeProvenance: "said", needsConfirmation: true, confirmationReason: "Is this a payment to Pushpa, or something you bought?" })],
  },
  shaky: { text: "hello hi so I want 50 rupees for lunch", confidence: -1.4, transactions: [row({ amount: 50 })] },
  noamount: { text: "lunch", confidence: -0.3, transactions: [] },
};

function fields(buf) {
  const text = buf.toString("latin1");
  const out = {};
  let audioBytes = 0;
  for (const part of text.split(/--+[-\w]{10,}/)) {
    const m = /name="([^"]+)"(; filename="[^"]*")?\r\n(?:Content-Type: ([^\r\n]+)\r\n)?\r\n([\s\S]*?)\r\n$/.exec(part);
    if (!m) continue;
    if (m[2]) { audioBytes = Buffer.byteLength(m[4], "latin1"); out.audioType = m[3]; }
    else out[m[1]] = m[4];
  }
  out.audioBytes = audioBytes;
  // The audio part is binary, so the pattern above can miss it; its type is still plain text.
  if (!out.audioType) {
    const at = text.indexOf('name="audio"');
    const m = at >= 0 ? /Content-Type: (.+)/.exec(text.slice(at, at + 200)) : null;
    if (m) out.audioType = m[1];
  }
  return out;
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__mode") { mode = url.searchParams.get("m") || "sure"; res.end(mode); return; }
  if (url.pathname === "/__log") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(log)); return; }
  if (url.pathname === "/__reset") { log = []; res.end("ok"); return; }
  if (url.pathname !== "/api/transcribe" || req.method !== "POST") { res.statusCode = 404; res.end("no"); return; }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const whole = Buffer.concat(chunks);
    const f = fields(whole);
    log.push({ at: Date.now(), mode, bodyBytes: whole.length, ...f, head: process.env.MOCK_DEBUG ? whole.toString('latin1').split('audio').slice(0,3).join('|AUDIO|').slice(0, 600) : undefined });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    if (mode === "drop") { req.socket.destroy(); return; }
    if (mode === "error") { res.statusCode = 502; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "The transcriber is busy. Try again in a moment." })); return; }
    if (mode === "html") { res.statusCode = 200; res.setHeader("Content-Type", "text/html"); res.end("<html>Bad gateway</html>"); return; }
    if (mode === "silent") { res.statusCode = 422; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Didn’t catch any speech there. Try again, a bit closer to the mic.", heard: null })); return; }

    const a = answers[mode === "slow" ? "sure" : mode] || answers.sure;
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.write(JSON.stringify({ heard: a.text, confidence: a.confidence }) + "\n");
    await wait(mode === "slow" ? 6000 : 900);
    res.end(JSON.stringify({ ...a, captureId: "cap-" + Date.now(), debug: {} }) + "\n");
  });
}).listen(port, "0.0.0.0", () => console.log(`widget mock on :${port}`));

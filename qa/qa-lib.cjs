// Shared toolkit for the QA suites: launch an engine, seed a browser state,
// mock every server call (and record what the app sent), and run named tests.
const pw = require("playwright");

const BASE = process.env.BASE || "http://localhost:3200";
const WAIT = BASE.includes("localhost") ? "networkidle" : "load";
const DEVICE = "11111111-1111-4111-8111-111111111111";

/* ---- Seeds: the state a browser can arrive in ---------------------------- */
function seedScript(kind, opts = {}) {
  const src = (kind, opts) => {
    const f = (v, p = "said") => ({ value: v, provenance: p });
    const iso = (d) => { const o = d.getTimezoneOffset() * 6e4; return new Date(d.getTime() - o).toISOString().slice(0, 10); };
    const S = localStorage;
    // The init script runs again on every page load; the state must be set up once,
    // or a test that deletes something would see it come back after a reload.
    if (S.getItem("qa.seeded")) return;
    S.setItem("qa.seeded", "1");
    if (kind === "fresh") return; // a browser that has never seen the app
    S.setItem("vaanitrack.device", opts.device);
    if (kind === "returning") return; // has a device id, has not answered the recordings question
    S.setItem("vaanitrack.onboarded", "true");
    S.setItem("vaanitrack.audioConsent", opts.consent || "granted");
    if (opts.settings) S.setItem("vaanitrack.settings", JSON.stringify(opts.settings));
    if (kind === "ready") return;
    const items = [["chai", 30], ["lunch", 140], ["dosa", 90], ["auto", 60], ["parking", 20], ["tea", 25], ["groceries", 420], ["recharge", 299], ["sting", 40], ["book", 250], ["mystery", 180]];
    const out = []; let n = 0;
    for (let back = 0; back < 36; back++) {
      if (back % 7 === 5) continue;
      const d = new Date(); d.setDate(d.getDate() - back);
      const k = 2 + (back % 3);
      for (let j = 0; j < k; j++) {
        const [desc, amt] = items[(back * 3 + j) % items.length];
        const at = new Date(d); at.setHours(j === 0 ? 9 : j === 1 ? 13 : 21, 10 + j, 0, 0);
        out.push({ id: "s" + n++, amount: f(amt + ((back * 7) % 40)), description: f(desc), category: f(null, "unknown"), payee: f(null, "unknown"), paymentMethod: f("UPI", "default"), date: f(iso(d), "default"), time: f(null, "unknown"), createdAt: at.toISOString(), source: "voice" });
      }
    }
    S.setItem("vaanitrack.transactions", JSON.stringify(out));
  };
  return `(${src.toString()})(${JSON.stringify(kind)}, ${JSON.stringify({ device: DEVICE, ...opts })})`;
}

/* ---- Server mocks ---------------------------------------------------------- */
const txn = (o = {}) => ({
  amount: 100, amountProvenance: "said",
  description: "thing", descriptionProvenance: "said",
  category: null, categoryProvenance: "unknown",
  payee: null, payeeProvenance: "unknown",
  paymentMethod: "UPI", paymentMethodProvenance: "default",
  date: null, dateProvenance: "default",
  time: null, timeProvenance: "unknown",
  needsConfirmation: false, confirmationReason: null,
  ...o,
});

function defaultExtract(body) {
  const text = String(body.text || "");
  const date = body.today || new Date().toISOString().slice(0, 10);
  const reply = (transactions) => ({ status: 200, json: { transactions, transcript: text, captureId: "cap-" + Math.random().toString(36).slice(2, 8) } });
  if (/boom/i.test(text)) return { status: 500, json: { error: "The model fell over." } };
  if (/bad502/i.test(text)) return { status: 502, json: { error: "The model returned malformed JSON." } };
  if (/empty/i.test(text)) return reply([]);
  if (/multi/i.test(text)) return reply([txn({ amount: 100, description: "chai", date }), txn({ amount: 200, description: "lunch", date })]);
  const m = text.match(/^\s*(\d+(?:\.\d+)?)\s*(.*)$/);
  const amount = m ? Number(m[1]) : null;
  const description = (m ? m[2] : text).replace(/\bunsure\b/i, "").trim() || null;
  const pay = body.defaultPayment || "UPI";
  const unsure = /unsure/i.test(text);
  return {
    delay: /slow/i.test(text) ? 1500 : 0,
    ...reply([txn({
      amount, amountProvenance: unsure ? "inferred" : "said",
      description, descriptionProvenance: description ? "said" : "unknown",
      paymentMethod: /\bcash\b/i.test(text) ? "Cash" : pay,
      paymentMethodProvenance: /\bcash\b/i.test(text) ? "said" : "default",
      date, dateProvenance: "default",
      needsConfirmation: unsure, confirmationReason: unsure ? "Unclear which is the amount." : null,
    })]),
  };
}

async function installMocks(ctx, state) {
  await ctx.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const body = (() => { try { return JSON.parse(req.postData() || "{}"); } catch { return {}; } })();
    if (state.netDown) return route.abort("internetdisconnected");
    if (p === "/api/extract") {
      state.extract.push(body);
      const r = (state.onExtract || defaultExtract)(body);
      if (r.delay) await new Promise((res) => setTimeout(res, r.delay));
      return route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.json) });
    }
    if (p === "/api/transcribe" && req.method() === "OPTIONS") {
      // The warm-up the app sends as recording starts; it is not a capture.
      state.warmups = (state.warmups || 0) + 1;
      return route.fulfill({ status: 204, body: "" });
    }
    if (p === "/api/transcribe") {
      state.transcribe.push({ size: (req.postData() || "").length });
      const r = (state.onTranscribe || (() => ({ text: "two fifty lunch", transactions: [txn({ amount: 250, description: "lunch" })] })))();
      if (r.fail) return route.fulfill({ status: r.fail, contentType: "application/json", body: JSON.stringify({ error: r.error || "no" }) });
      const lines = [{ heard: r.text, confidence: r.confidence ?? 0.9 }, { text: r.text, confidence: r.confidence ?? 0.9, captureId: "cap-v1", debug: { bytes: 1000, type: "audio/webm", noSpeechProb: 0.01, confidence: 0.9, asrMs: 100, extractMs: 100 }, ...(r.extractError ? { extractError: r.extractError } : { transactions: r.transactions }) }];
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: lines.map((l) => JSON.stringify(l)).join("\n") + "\n" });
    }
    if (p === "/api/erase") {
      state.erase.push(body);
      const r = state.onErase ? state.onErase(body) : { status: 200, json: { ok: true, recordings: 0, captures: 0 } };
      return route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.json) });
    }
    if (p === "/api/observe") { state.observe.push(body); return route.fulfill({ status: 200, contentType: "application/json", body: "{}" }); }
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
}

/* ---- Launching ------------------------------------------------------------- */
const browsers = {};
async function engine(name) {
  if (!browsers[name]) {
    const args = name === "chromium" ? ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] : [];
    browsers[name] = await pw[name].launch({ args });
  }
  return browsers[name];
}
async function closeAll() { for (const b of Object.values(browsers)) await b.close(); }

async function open(name, profile, o = {}) {
  const browser = await engine(name);
  const device = profile === "desktop" ? { viewport: { width: 1280, height: 800 } } : pw.devices[profile];
  const ctx = await browser.newContext({ ...device, deviceScaleFactor: 1, acceptDownloads: true, permissions: name === "chromium" ? ["microphone"] : [], ...(o.context || {}) });
  const state = { extract: [], transcribe: [], erase: [], observe: [], errors: [], warnings: [], ...(o.state || {}) };
  await ctx.addInitScript(seedScript(o.seed || "ready", o.seedOpts || {}));
  if (o.init) await ctx.addInitScript(o.init);
  if (o.mock !== false) await installMocks(ctx, state);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => state.errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && !/Failed to load resource/.test(t)) state.errors.push("console: " + t.slice(0, 200));
    if (m.type() === "warning") state.warnings.push(t.slice(0, 200));
  });
  const go = async (path) => { await page.goto(BASE + path, { waitUntil: WAIT }); await page.waitForTimeout(700); };
  return { page, ctx, state, go, close: () => ctx.close() };
}

/* ---- Running --------------------------------------------------------------- */
const results = [];
async function test(name, fn, { timeout = 60000 } = {}) {
  const checks = [];
  const t = {
    ok: (what, pass, extra = "") => checks.push({ what, pass: !!pass, extra: String(extra).slice(0, 200) }),
    eq: (what, got, want) => checks.push({ what, pass: JSON.stringify(got) === JSON.stringify(want), extra: `got ${JSON.stringify(got)} want ${JSON.stringify(want)}` }),
  };
  let crashed = null;
  try {
    await Promise.race([fn(t), new Promise((_, rej) => setTimeout(() => rej(new Error("test timed out")), timeout))]);
  } catch (e) { crashed = String(e && e.message || e).split("\n")[0].slice(0, 220); }
  const failed = checks.filter((c) => !c.pass);
  const pass = !crashed && failed.length === 0;
  results.push({ name, pass, checks: checks.length, failed, crashed });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  (${checks.length} checks)`);
  for (const c of failed) console.log(`        ✗ ${c.what}${c.extra ? "  → " + c.extra : ""}`);
  if (crashed) console.log(`        ✗ crashed: ${crashed}`);
}
function summary() {
  const bad = results.filter((r) => !r.pass);
  console.log(`\n${results.length - bad.length}/${results.length} tests passed, ${results.reduce((n, r) => n + r.checks, 0)} checks`);
  return bad.length;
}

module.exports = { pw, BASE, WAIT, DEVICE, txn, open, test, summary, closeAll, defaultExtract };

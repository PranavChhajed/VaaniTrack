// Where the time goes. Records a CPU profile around one action on a heavy journal and prints
// the functions that spent the most time themselves (self time), grouped by file.
//   node qa/audit-profile.cjs journal     (opening the Journal tab)
//   node qa/audit-profile.cjs add         (typing an expense and saving it)
//   node qa/audit-profile.cjs load        (loading /app cold)
const pw = require("playwright");
const lib = require("./qa-lib.cjs");
const BASE = process.env.BASE || "http://localhost:3200";
const N = Number(process.env.N || 1500);
const what = process.argv[2] || "journal";

const seed = `(() => {
  const S = localStorage; if (S.getItem("qa.seeded")) return; S.setItem("qa.seeded", "1");
  S.setItem("vaanitrack.device", "11111111-1111-4111-8111-111111111111"); S.setItem("vaanitrack.onboarded", "true"); S.setItem("vaanitrack.audioConsent", "granted");
  const f = (v, p = "said") => ({ value: v, provenance: p });
  const names = ["chai","lunch","dosa","auto","parking","tea","groceries","recharge","metro","book","petrol","snacks"];
  const iso = (d) => { const o = d.getTimezoneOffset() * 6e4; return new Date(d.getTime() - o).toISOString().slice(0, 10); };
  const out = [];
  for (let i = 0; i < ${N}; i++) { const d = new Date(); d.setDate(d.getDate() - Math.floor(i / 4)); const at = new Date(d); at.setHours(8 + (i % 4) * 4, 10, 0, 0);
    out.push({ id: "h" + i, amount: f(20 + ((i * 37) % 900)), description: f(names[i % names.length]), category: f(null, "unknown"), payee: f(null, "unknown"), paymentMethod: f(["UPI","Cash","Card"][i % 3], "default"), date: f(iso(d), "default"), time: f(null, "unknown"), createdAt: at.toISOString(), source: "voice" }); }
  S.setItem("vaanitrack.transactions", JSON.stringify(out));
})()`;

(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(seed);
  const page = await ctx.newPage();
  await page.route("**/api/extract", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transcript: "x", captureId: "c1", transactions: [lib.txn({ amount: 250, description: "lunch", date: new Date().toISOString().slice(0, 10) })] }) }));
  await page.route("**/api/**", (r) => r.request().url().includes("/extract") ? r.fallback() : r.fulfill({ status: 204, body: "" }));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  if (what !== "load") { await page.goto(BASE + "/app", { waitUntil: "load" }); await page.waitForTimeout(1500); }
  await cdp.send("Profiler.start");
  const t0 = Date.now();
  if (what === "journal") { await page.getByRole("link", { name: "Journal", exact: true }).click(); await page.waitForURL("**/journal"); await page.waitForTimeout(1200); }
  else if (what === "add") { await page.getByPlaceholder(/250 lunch/).fill("250 lunch"); await page.getByRole("button", { name: "Add", exact: true }).click(); await page.getByRole("button", { name: "Undo" }).first().waitFor(); await page.waitForTimeout(500); }
  else { await page.goto(BASE + "/app", { waitUntil: "load" }); await page.waitForTimeout(1500); }
  const wall = Date.now() - t0;
  const { profile } = await cdp.send("Profiler.stop");
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => { const n = byId.get(id); const key = `${n.callFrame.functionName || "(anonymous)"}  ${(n.callFrame.url || "").split("/").slice(-1)[0].slice(0, 40)}:${n.callFrame.lineNumber}`; self.set(key, (self.get(key) || 0) + (dt[i] || 0)); });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  console.log(`${what}: ${wall} ms wall, ${(total / 1000).toFixed(0)} ms of CPU sampled (x${4} slowdown)\n`);
  [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).forEach(([k, v]) => console.log(String((v / 1000).toFixed(0)).padStart(6) + " ms  " + k));
  await browser.close();
})();

// How the app behaves for someone who has used it for a long time: a journal of N
// expenses, on a mid-range phone (CPU slowed 4x). Times what a person waits for:
// opening each screen, switching tabs, saving a typed expense, opening a day.
//   N=3000 node qa/audit-heavy.cjs
const pw = require("playwright");
const lib = require("./qa-lib.cjs");
const BASE = process.env.BASE || "http://localhost:3200";
const N = Number(process.env.N || 3000);
const CPU = Number(process.env.CPU || 4);

function seed(n) {
  return `(() => {
    const S = localStorage;
    if (S.getItem("qa.seeded")) return; S.setItem("qa.seeded", "1");
    S.setItem("vaanitrack.device", "11111111-1111-4111-8111-111111111111");
    S.setItem("vaanitrack.onboarded", "true"); S.setItem("vaanitrack.audioConsent", "granted");
    const f = (v, p = "said") => ({ value: v, provenance: p });
    const names = ["chai","lunch","dosa","auto","parking","tea","groceries","recharge","metro","book","petrol","snacks"];
    const iso = (d) => { const o = d.getTimezoneOffset() * 6e4; return new Date(d.getTime() - o).toISOString().slice(0, 10); };
    const out = []; const per = 4;
    for (let i = 0; i < ${n}; i++) {
      const d = new Date(); d.setDate(d.getDate() - Math.floor(i / per));
      const at = new Date(d); at.setHours(8 + (i % per) * 4, 10, 0, 0);
      out.push({ id: "h" + i, amount: f(20 + ((i * 37) % 900)), description: f(names[i % names.length]), category: f(null, "unknown"), payee: f(null, "unknown"), paymentMethod: f(["UPI","Cash","Card"][i % 3], "default"), date: f(iso(d), "default"), time: f(null, "unknown"), createdAt: at.toISOString(), source: "voice" });
    }
    S.setItem("vaanitrack.transactions", JSON.stringify(out));
  })()`;
}

(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(seed(N));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.route("**/api/extract", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transcript: "x", captureId: "c1", transactions: [lib.txn({ amount: 250, description: "lunch", date: new Date().toISOString().slice(0, 10) })] }) }));
  await page.route("**/api/**", (r) => r.request().url().includes("/extract") ? r.fallback() : r.fulfill({ status: 204, body: "" }));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });

  const t = async (label, fn) => { const s = Date.now(); await fn(); const ms = Date.now() - s; console.log(`${label.padEnd(46)} ${String(ms).padStart(5)} ms`); return ms; };
  const longTasks = [];
  await page.addInitScript(() => { window.__long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ entryTypes: ["longtask"] }); } catch {} });

  console.log(`journal of ${N} expenses, CPU x${CPU}\n`);
  await t("open /app (until record button is usable)", async () => { await page.goto(BASE + "/app", { waitUntil: "load" }); await page.getByRole("button", { name: /say what you spent|record|tap to/i }).first().waitFor(); });
  await t("capture: type + Add -> row appears", async () => {
    await page.getByPlaceholder(/250 lunch/).fill("250 lunch"); await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("button", { name: "Undo" }).first().waitFor({ timeout: 10000 });
  });
  await t("tab -> Journal (until days visible)", async () => { await page.getByRole("link", { name: "Journal", exact: true }).click(); await page.waitForURL("**/journal"); await page.getByRole("grid, table, [role=grid]").first().waitFor({ timeout: 8000 }).catch(() => {}); });
  await page.waitForTimeout(400);
  await t("tab -> Insights", async () => { await page.getByRole("link", { name: "Insights", exact: true }).click(); await page.waitForURL("**/insights"); });
  await page.waitForTimeout(400);
  await t("tab -> Capture", async () => { await page.getByRole("link", { name: "Capture", exact: true }).click(); await page.waitForURL("**/app"); });
  await page.waitForTimeout(300);
  await t("tab -> Journal again", async () => { await page.getByRole("link", { name: "Journal", exact: true }).click(); await page.waitForURL("**/journal"); });
  await page.waitForTimeout(400);
  const lt = await page.evaluate(() => window.__long || []);
  console.log(`\nlong tasks on this page: ${lt.length} (worst ${Math.max(0, ...lt)} ms)  errors: ${errors.length ? errors.join(" | ") : "none"}`);
  // storage size
  const size = await page.evaluate(() => (localStorage.getItem("vaanitrack.transactions") || "").length);
  console.log(`journal stored as ${(size / 1024).toFixed(0)} KB of the ~5000 KB a browser allows`);
  await browser.close();
})();

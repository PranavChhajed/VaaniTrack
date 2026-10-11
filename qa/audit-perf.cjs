// What a page costs to open: bytes, requests, and the time to each milestone, on a
// phone-like connection. `node qa/audit-perf.cjs [route...]`, NET=fast|slow, SEED=fresh|data
const pw = require("playwright");
const lib = require("./qa-lib.cjs");
const BASE = process.env.BASE || "http://localhost:3200";
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ["", "app", "journal", "insights", "you", "signup"];
const NET = process.env.NET || "mid";
const PROFILES = {
  fast: { latency: 40, down: 10 * 1024 * 1024 / 8, cpu: 1 },
  mid: { latency: 150, down: 1.6 * 1024 * 1024 / 8, cpu: 4 },   // slow 4G, mid-range phone
  slow: { latency: 400, down: 400 * 1024 / 8, cpu: 6 },
};

(async () => {
  const browser = await pw.chromium.launch();
  for (const route of routes) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(lib.seedScript(process.env.SEED || "data", { device: "11111111-1111-4111-8111-111111111111" }));
    const page = await ctx.newPage();
    await page.route("**/api/**", (r) => r.fulfill({ status: 204, body: "" }));
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    const p = PROFILES[NET];
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: p.latency, downloadThroughput: p.down, uploadThroughput: p.down });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
    const reqs = [];
    cdp.on("Network.responseReceived", (e) => reqs.push({ url: e.response.url, type: e.type, id: e.requestId }));
    const sizes = new Map();
    cdp.on("Network.loadingFinished", (e) => sizes.set(e.requestId, e.encodedDataLength));
    await page.addInitScript(() => {
      window.__lcp = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(BASE + "/" + route, { waitUntil: "load", referer: BASE + "/" });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const paint = Object.fromEntries(performance.getEntriesByType("paint").map((e) => [e.name, Math.round(e.startTime)]));
      return { ttfb: Math.round(nav.responseStart), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), fcp: paint["first-contentful-paint"], lcp: Math.round(window.__lcp), cls: Math.round(window.__cls * 1000) / 1000 };
    });
    const by = { script: 0, stylesheet: 0, font: 0, image: 0, document: 0, other: 0 };
    const count = { script: 0, font: 0, image: 0 };
    let total = 0;
    for (const r of reqs) {
      const s = sizes.get(r.id) || 0; total += s;
      const t = (r.type || "").toLowerCase();
      const k = t === "script" ? "script" : t === "stylesheet" ? "stylesheet" : t === "font" ? "font" : t === "image" ? "image" : t === "document" ? "document" : "other";
      by[k] += s; if (count[k] !== undefined) count[k]++;
    }
    const kb = (n) => (n / 1024).toFixed(0) + "KB";
    console.log(`/${route.padEnd(9)} ttfb ${String(m.ttfb).padStart(4)}  fcp ${String(m.fcp).padStart(5)}  lcp ${String(m.lcp).padStart(5)}  load ${String(m.load).padStart(5)} ms  cls ${m.cls}   JS ${kb(by.script)} (${count.script})  css ${kb(by.stylesheet)}  fonts ${kb(by.font)} (${count.font})  img ${kb(by.image)} (${count.image})  total ${kb(total)} in ${reqs.length} requests`);
    await ctx.close();
  }
  await browser.close();
})();

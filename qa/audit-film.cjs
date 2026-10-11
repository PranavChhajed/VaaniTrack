// A filmstrip of the first few seconds of a page load, for a browser that has never
// seen the app. Saves qa/shots/film/<name>-NN.jpg and prints the time each frame was
// taken, so a late or missing animation is something to look at, not to guess.
//
//   node qa/audit-film.cjs landing /            (the page at /, a fresh visitor)
//   node qa/audit-film.cjs app /app             (a fresh visitor straight to the app)
//   NET=slow node qa/audit-film.cjs app /app    (a slow phone connection)
const pw = require("playwright");
const fs = require("fs");
const path = require("path");
const lib = require("./qa-lib.cjs");

const [name = "page", url = "/"] = process.argv.slice(2);
const BASE = process.env.BASE || "http://localhost:3200";
const W = Number(process.env.W || 360), H = Number(process.env.H || 740);
const SEED = process.env.SEED || "fresh";

(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(lib.seedScript(SEED, { device: "11111111-1111-4111-8111-111111111111" }));
  const page = await ctx.newPage();
  await page.route("**/api/**", (r) => r.fulfill({ status: 204, body: "" }));
  if (process.env.NET === "slow") {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  const dir = path.join(__dirname, "shots", "film");
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  const nav = page.goto(BASE + "/" + url.replace(/^\/+/, ""), { waitUntil: "commit" });
  const frames = [];
  for (let i = 0; i < 14; i++) {
    const at = Date.now() - t0;
    const f = path.join(dir, `${name}-${String(i).padStart(2, "0")}.jpg`);
    await page.screenshot({ path: f, type: "jpeg", quality: 70 }).catch(() => {});
    frames.push(at);
    await page.waitForTimeout(i < 6 ? 120 : 350);
  }
  await nav.catch(() => {});
  console.log("frame times (ms):", frames.join(", "));
  await browser.close();
})();

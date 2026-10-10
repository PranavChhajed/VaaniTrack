// Runs the app in WebKit (Safari's engine) with iPhone profiles.
const { webkit, devices } = require("playwright");
const path = require("path");
const WAIT = (process.env.BASE || "http://localhost").includes("localhost") ? "networkidle" : "load";
const BASE = "http://localhost:3200";
const OUT = __dirname;

const seed = () => {
  const f = (v, p = "said") => ({ value: v, provenance: p });
  const iso = (d) => {
    const o = d.getTimezoneOffset() * 6e4;
    return new Date(d.getTime() - o).toISOString().slice(0, 10);
  };
  const items = [["chai", 30], ["lunch", 140], ["dosa", 90], ["auto", 60], ["parking", 20], ["tea", 25], ["groceries", 420], ["recharge", 299], ["sting", 40], ["book", 250], ["mystery", 180]];
  const out = [];
  let n = 0;
  for (let back = 0; back < 36; back++) {
    if (back % 7 === 5) continue;
    const d = new Date();
    d.setDate(d.getDate() - back);
    const k = 2 + (back % 3);
    for (let j = 0; j < k; j++) {
      const [desc, amt] = items[(back * 3 + j) % items.length];
      const at = new Date(d);
      at.setHours(j === 0 ? 9 : j === 1 ? 13 : 21, 10 + j, 0, 0);
      out.push({ id: "s" + n++, amount: f(amt + ((back * 7) % 40)), description: f(desc), category: f(null, "unknown"), payee: f(null, "unknown"), paymentMethod: f("UPI", "default"), date: f(iso(d), "default"), time: f(null, "unknown"), createdAt: at.toISOString(), source: "voice" });
    }
  }
  localStorage.setItem("vaanitrack.transactions", JSON.stringify(out));
  localStorage.setItem("vaanitrack.device", crypto.randomUUID());
  localStorage.setItem("vaanitrack.onboarded", "true");
  localStorage.setItem("vaanitrack.audioConsent", "granted");
};

async function run(profileName) {
  const results = { profile: profileName, pages: {}, problems: [] };
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices[profileName] });
  await ctx.addInitScript(`(${seed.toString()})()`);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200));
  });

  results.ua = await (async () => {
    await page.goto(BASE + "/app");
    return page.evaluate(() => ({
      ua: navigator.userAgent.slice(0, 90),
      w: innerWidth,
      h: innerHeight,
      hasMediaDevices: !!navigator.mediaDevices,
      hasGUM: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      hasMediaRecorder: typeof MediaRecorder !== "undefined",
      hasAudioContext: typeof AudioContext !== "undefined" || typeof webkitAudioContext !== "undefined",
      hasRandomUUID: typeof crypto.randomUUID === "function",
      localStorageOK: (() => { try { localStorage.setItem("t", "1"); localStorage.removeItem("t"); return true; } catch { return false; } })(),
    }));
  })();

  for (const route of ["/", "/app", "/journal", "/insights", "/you", "/signin", "/signup"]) {
    errors.length = 0;
    await page.goto(BASE + route, { waitUntil: WAIT }).catch(() => {});
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => {
      const de = document.documentElement;
      const nav = document.querySelector('nav[aria-label="Screens"]');
      const navRect = nav ? nav.getBoundingClientRect() : null;
      const inputs = [...document.querySelectorAll("input")].map((i) => parseFloat(getComputedStyle(i).fontSize));
      const smallTargets = [...document.querySelectorAll("a,button")]
        .map((e) => ({ t: (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 24), r: e.getBoundingClientRect() }))
        .filter((x) => x.r.width > 0 && x.r.height > 0 && (x.r.height < 40 || x.r.width < 40) && x.r.width * x.r.height < 40 * 40);
      return {
        path: location.pathname,
        overflowX: de.scrollWidth > de.clientWidth + 1,
        scrollW: de.scrollWidth,
        clientW: de.clientWidth,
        navBottomGap: navRect ? Math.round(innerHeight - navRect.bottom) : null,
        navWidth: navRect ? Math.round(navRect.width) : null,
        minInputFont: inputs.length ? Math.min(...inputs) : null,
        smallTargets: smallTargets.slice(0, 5).map((x) => `${x.t}:${Math.round(x.r.width)}x${Math.round(x.r.height)}`),
        textStart: document.body.innerText.replace(/\s+/g, " ").slice(0, 110),
      };
    });
    info.errors = [...errors];
    results.pages[route] = info;
    const shot = path.join(OUT, `ios-${profileName.replace(/\s/g, "")}-${route === "/" ? "home" : route.slice(1)}.png`);
    await page.screenshot({ path: shot, fullPage: false });
  }

  // Persistence across a reload.
  await page.goto(BASE + "/journal", { waitUntil: WAIT });
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("vaanitrack.transactions") || "[]").length);
  await page.reload({ waitUntil: WAIT });
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("vaanitrack.transactions") || "[]").length);
  results.persistence = { before, after };

  // Typed entry end to end through the real UI (no network model: only checks the form).
  await page.goto(BASE + "/app", { waitUntil: WAIT });
  await page.waitForTimeout(800);
  const typedBox = page.locator('input[aria-label="Type an expense"]');
  await typedBox.tap();
  await typedBox.fill("120 test");
  results.typedZoomSafe = await typedBox.evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 16);

  // Deep link, with the microphone as this engine gives it.
  const p2 = await ctx.newPage();
  const e2 = [];
  p2.on("pageerror", (e) => e2.push(e.message));
  await p2.goto(BASE + "/app?record=1", { waitUntil: WAIT });
  await p2.waitForTimeout(3000);
  results.deepLink = await p2.evaluate(() => ({
    url: location.pathname + location.search,
    notice: [...document.querySelectorAll("[role=status]")].map((e) => e.textContent.slice(0, 80)),
    alerts: [...document.querySelectorAll("p")].filter((p) => p.className.includes("border-alert")).map((p) => p.textContent.slice(0, 100)),
    button: document.querySelector("main button")?.textContent,
  }));
  results.deepLink.pageErrors = e2;
  await p2.screenshot({ path: path.join(OUT, `ios-${profileName.replace(/\s/g, "")}-deeplink.png`) });
  await browser.close();
  return results;
}

(async () => {
  for (const p of process.argv.slice(2)) {
    const r = await run(p);
    console.log("=====", p);
    console.log(JSON.stringify(r, null, 1));
  }
})().catch((e) => { console.error("FAILED", e); process.exit(1); });

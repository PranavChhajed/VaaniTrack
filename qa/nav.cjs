// The bottom bar: flat (no blur, no shadow), a 2px ink border, an ink lens under the current tab,
// and readable text on both. See docs/DESIGN.md and docs/design/LIQUID-GLASS.md.
const pw = require("playwright");
const path = require("path");
const fs = require("fs");
const WAIT = (process.env.BASE || "http://localhost").includes("localhost") ? "networkidle" : "load";
const BASE = process.env.BASE || "http://localhost:3200";
const OUT = __dirname;
const seedSrc = fs.readFileSync(path.join(__dirname, "ios.cjs"), "utf8").match(/const seed = \(\) => \{[\s\S]*?\n\};/)[0];

const lum = (r, g, b) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };

async function pixels(page, pngBuf, points) {
  const b64 = pngBuf.toString("base64");
  return page.evaluate(async ({ b64, points }) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return points.map(([x, y]) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3));
  }, { b64, points });
}

async function run(engineName, profile) {
  const engine = pw[engineName];
  const browser = await engine.launch();
  const device = pw.devices[profile];
  const ctx = await browser.newContext({ ...device, deviceScaleFactor: 2 });
  await ctx.addInitScript(`(${seedSrc.replace("const seed = ", "")})()`.replace(/;\)\(\)$/, ")()"));
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 150)));
  const log = [];
  const ok = (n, p, x = "") => log.push(`${p ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`);
  const tag = `${engineName}-${profile.replace(/\s/g, "")}`;

  await page.goto(BASE + "/app", { waitUntil: WAIT });
  await page.waitForTimeout(1200);

  const BAR = 'nav[aria-label="Screens"] > div';
  const info = await page.evaluate((BAR) => {
    const bar = document.querySelector(BAR);
    const cs = getComputedStyle(bar);
    const lens = document.querySelector(".nav-lens");
    const r = bar.getBoundingClientRect();
    return {
      blur: cs.backdropFilter || cs.webkitBackdropFilter || "none",
      shadow: cs.boxShadow,
      border: cs.borderTopWidth + " " + cs.borderTopColor,
      bg: cs.backgroundColor,
      barW: Math.round(r.width), barH: Math.round(r.height),
      lensW: Math.round(lens.getBoundingClientRect().width),
      lensBg: getComputedStyle(lens).backgroundColor,
      tabs: [...document.querySelectorAll('nav[aria-label="Screens"] a')].map((a) => [a.textContent.trim(), Math.round(a.getBoundingClientRect().width), Math.round(a.getBoundingClientRect().height)]),
    };
  }, BAR);
  ok("flat: no blur", !info.blur || info.blur === "none", info.blur.slice(0, 40));
  ok("flat: no shadow", info.shadow === "none", info.shadow.slice(0, 40));
  ok("a 2px ink border", info.border === "2px rgb(26, 26, 26)", info.border);
  ok("raised paper inside", info.bg === "rgb(249, 247, 243)", info.bg);
  ok("the lens is solid ink", info.lensBg === "rgb(26, 26, 26)", info.lensBg);
  ok("bar is a pill of sensible size", info.barW >= 280 && info.barH >= 50 && info.barH <= 64, `${info.barW}x${info.barH}`);
  ok("every tab is at least 44px tall", info.tabs.every((t) => t[2] >= 44), JSON.stringify(info.tabs));
  ok("lens is one third of the pill", Math.abs(info.lensW * 3 - (info.barW - 12)) < 12, `lens=${info.lensW}`);

  const tx = () => page.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector(".nav-lens")).transform);
    const op = parseFloat(getComputedStyle(document.querySelector(".nav-lens")).opacity);
    return { x: Math.round(m.m41), op };
  });
  const lensW = info.lensW;

  const nav = (label) => page.locator('nav[aria-label="Screens"]').getByText(label, { exact: true });
  // The marker must be readable: the current tab's text on the ink lens, the others on paper.
  const colours = () => page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Screens"] a')].map((a) => [a.textContent.trim(), getComputedStyle(a).color, a.getAttribute("aria-current")]));
  const readable = async (label) => {
    await page.waitForTimeout(450);
    const rows = await colours();
    const rgb = (c) => c.match(/\d+/g).slice(0, 3).map(Number);
    const worst = Math.min(...rows.map(([, c, cur]) => {
      const t = rgb(c); const bg = cur ? [26, 26, 26] : [249, 247, 243];
      return ratio(lum(...t), lum(...bg));
    }));
    ok(`${label}: current tab and the others are readable (${worst.toFixed(1)}:1, needs 4.5)`, worst >= 4.5, JSON.stringify(rows));
  };
  let s = await tx();
  ok("Capture: lens at the first tab", s.x === 0 && s.op === 1, JSON.stringify(s));
  await readable("Capture");
  await nav("Journal").tap(); await page.waitForURL(/journal/, { timeout: 20000 }); await page.waitForTimeout(900);
  s = await tx();
  ok("Journal: lens moved one tab", Math.abs(s.x - lensW) <= 2 && s.op === 1, JSON.stringify(s));
  await readable("Journal");
  await nav("Insights").tap(); await page.waitForURL(/insights/, { timeout: 20000 }); await page.waitForTimeout(900);
  s = await tx();
  ok("Insights: lens moved two tabs", Math.abs(s.x - 2 * lensW) <= 3 && s.op === 1, JSON.stringify(s));
  await readable("Insights");
  await nav("Capture").tap(); await page.waitForURL(/\/app/, { timeout: 20000 }); await page.waitForTimeout(900);
  s = await tx();
  ok("Capture again: lens came back", s.x === 0 && s.op === 1, JSON.stringify(s));
  await page.goto(BASE + "/you", { waitUntil: WAIT }); await page.waitForTimeout(900);
  s = await tx();
  ok("You (not a tab): lens hidden", s.op === 0, JSON.stringify(s));
  ok("You: no tab is marked current", (await page.locator('nav a[aria-current="page"]').count()) === 0);
  await page.goto(BASE + "/journal", { waitUntil: WAIT }); await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `nav-${tag}.png`) });

  // A wide look at it.
  ok("no script errors", errs.length === 0, errs.slice(0, 2).join(" | "));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  ok("no sideways scroll", !overflow);
  console.log(`--- ${engineName} / ${profile}\n` + log.join("\n"));
  await browser.close();
}

(async () => {
  const jobs = process.argv.slice(2).map((a) => a.split(":"));
  for (const [engine, profile] of jobs) await run(engine, profile);
})().catch((e) => { console.error("FAILED", String(e).slice(0, 500)); process.exit(1); });

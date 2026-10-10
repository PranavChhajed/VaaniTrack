// The liquid-glass bar: position of the lens, blur applied, readability over light and dark.
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

  const info = await page.evaluate(() => {
    const bar = document.querySelector(".glass-bar");
    const cs = getComputedStyle(bar);
    const lens = document.querySelector(".glass-lens");
    const r = bar.getBoundingClientRect();
    return {
      blur: cs.backdropFilter || cs.webkitBackdropFilter || "none",
      barW: Math.round(r.width), barH: Math.round(r.height), barBottomGap: Math.round(innerHeight - r.bottom),
      lensW: Math.round(lens.getBoundingClientRect().width),
      tabs: [...document.querySelectorAll('nav[aria-label="Screens"] a')].map((a) => [a.textContent.trim(), Math.round(a.getBoundingClientRect().width), Math.round(a.getBoundingClientRect().height)]),
    };
  });
  ok("blur is applied", info.blur && info.blur !== "none", info.blur.slice(0, 40));
  ok("bar is a pill of sensible size", info.barW >= 280 && info.barH >= 50 && info.barH <= 64, `${info.barW}x${info.barH}`);
  ok("every tab is at least 44px tall", info.tabs.every((t) => t[2] >= 44), JSON.stringify(info.tabs));
  ok("lens is one third of the pill", Math.abs(info.lensW * 3 - (info.barW - 10)) < 12, `lens=${info.lensW}`);

  const tx = () => page.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector(".glass-lens")).transform);
    const op = parseFloat(getComputedStyle(document.querySelector(".glass-lens")).opacity);
    return { x: Math.round(m.m41), op };
  });
  const lensW = info.lensW;

  const nav = (label) => page.locator('nav[aria-label="Screens"]').getByText(label, { exact: true });
  let s = await tx();
  ok("Capture: lens at the first tab", s.x === 0 && s.op === 1, JSON.stringify(s));
  await nav("Journal").tap(); await page.waitForTimeout(900);
  s = await tx();
  ok("Journal: lens moved one tab", Math.abs(s.x - lensW) <= 2 && s.op === 1, JSON.stringify(s));
  await nav("Insights").tap(); await page.waitForTimeout(900);
  s = await tx();
  ok("Insights: lens moved two tabs", Math.abs(s.x - 2 * lensW) <= 3 && s.op === 1, JSON.stringify(s));
  await nav("Capture").tap(); await page.waitForTimeout(900);
  s = await tx();
  ok("Capture again: lens came back", s.x === 0 && s.op === 1, JSON.stringify(s));
  await page.goto(BASE + "/you", { waitUntil: WAIT }); await page.waitForTimeout(900);
  s = await tx();
  ok("You (not a tab): lens hidden", s.op === 0, JSON.stringify(s));
  ok("You: no tab is marked current", (await page.locator('nav a[aria-current="page"]').count()) === 0);

  // Readability: ink text against what the glass looks like over paper and over the dark panel.
  const sample = async (where, route) => {
    await page.goto(BASE + route, { waitUntil: WAIT }); await page.waitForTimeout(900);
    if (route === "/app") await page.evaluate(() => window.scrollTo(0, 0));
    else await page.evaluate(() => {
      const chamber = [...document.querySelectorAll("section")].find((e) => getComputedStyle(e).backgroundColor === "rgb(26, 26, 26)");
      const r = chamber.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + r.top + Math.min(900, r.height / 2));
    });
    await page.waitForTimeout(500);
    const behind = await page.evaluate(() => {
      const r = document.querySelector(".glass-bar").getBoundingClientRect();
      // What is under the bar's middle, ignoring the bar itself.
      const bar = document.querySelector("nav[aria-label='Screens']"); bar.style.visibility = "hidden";
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      let n = el, bg = "none";
      while (n && (bg === "none" || bg === "rgba(0, 0, 0, 0)")) { bg = getComputedStyle(n).backgroundColor; n = n.parentElement; }
      bar.style.visibility = "";
      return bg;
    });
    const shot = await page.screenshot({ path: path.join(OUT, `glass-${tag}-${where}.png`) });
    const box = await page.evaluate(() => { const r = document.querySelector(".glass-bar").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const dpr = 2, tabW = (box.w - 8) / 3, cy = box.y + box.h / 2;
    // Empty glass: the boundaries between tabs (their labels are centred, so these are clear) and the left cap.
    const pts = [[box.x + 4 + tabW * 1, cy], [box.x + 4 + tabW * 2, cy], [box.x + 4 + tabW * 2 + 6, cy + 10]].map(([x, y]) => [x * dpr, y * dpr]);
    const bg = await pixels(page, shot, pts);
    const ink = lum(26, 26, 26);
    const worst = Math.min(...bg.map(([r, g, b]) => ratio(lum(r, g, b), ink)));
    const m = behind.match(/\d+/g).map(Number); const what = lum(m[0], m[1], m[2]) < 0.1 ? 'the DARK panel' : 'PAPER';
    ok(`readable over ${what}: ink on glass ${worst.toFixed(1)}:1, needs 4.5`, worst >= 4.5, JSON.stringify(bg.map((p) => p.join(","))));
  };
  await sample("paper", "/app");
  await sample("dark", "/journal");

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

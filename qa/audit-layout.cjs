// Layout audit: every screen on many phone sizes. Reports, for each, anything that
// overflows sideways, text cut off by its box, tap targets under 44px, images with no
// size, and console errors; and saves a screenshot to qa/shots/<device>/<screen>.png.
//
//   node qa/audit-layout.cjs                 all devices, all screens
//   DEVICES=se,pixel5 node qa/audit-layout.cjs
//
// States are seeded with qa-lib's `seedScript`, so every screen is visited in the
// state a real person would be in ("fresh" for the first-run flow, "data" for a busy journal).
const pw = require("playwright");
const fs = require("fs");
const path = require("path");
const lib = require("./qa-lib.cjs");

const BASE = process.env.BASE || "http://localhost:3200";

const DEVICES = {
  tiny: { w: 320, h: 568, dpr: 2, engine: "chromium", ua: "mobile" },      // iPhone 5 / small Android
  se: { w: 375, h: 667, dpr: 2, engine: "webkit", ua: "iphone" },          // iPhone SE 2/3
  i14: { w: 390, h: 844, dpr: 3, engine: "webkit", ua: "iphone" },         // iPhone 14
  i15pm: { w: 430, h: 932, dpr: 3, engine: "webkit", ua: "iphone" },       // iPhone 15 Pro Max
  pixel5: { w: 393, h: 851, dpr: 2.75, engine: "chromium", ua: "android" },
  s8: { w: 360, h: 740, dpr: 4, engine: "chromium", ua: "android" },       // Galaxy S8 (very common width)
  a50: { w: 412, h: 915, dpr: 2.6, engine: "chromium", ua: "android" },    // Galaxy A-series
  fold: { w: 280, h: 653, dpr: 3, engine: "chromium", ua: "android" },     // Galaxy Fold, folded
  short: { w: 360, h: 520, dpr: 2, engine: "chromium", ua: "android" },    // browser chrome eating the height
  land: { w: 740, h: 360, dpr: 3, engine: "chromium", ua: "android" },     // phone on its side
  tablet: { w: 768, h: 1024, dpr: 2, engine: "chromium", ua: "mobile" },
  desk: { w: 1280, h: 800, dpr: 1, engine: "chromium", ua: "desktop" },
};

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  mobile: undefined,
  desktop: undefined,
};

const SCREENS = [
  { name: "landing", url: "/", seed: "fresh" },
  { name: "signup", url: "/signup", seed: "fresh" },
  { name: "signin", url: "/signin", seed: "fresh" },
  { name: "capture-empty", url: "/app", seed: "ready" },
  { name: "journal-empty", url: "/journal", seed: "ready" },
  { name: "capture", url: "/app", seed: "data" },
  { name: "journal", url: "/journal", seed: "data" },
  { name: "insights", url: "/insights", seed: "data" },
  { name: "you", url: "/you", seed: "data" },
];

// Runs in the page. Everything it returns is a fact about the layout, not a guess.
function inspect() {
  const vw = document.documentElement.clientWidth;
  const out = { vw, scrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth, overflowX: [], clipped: [], small: [], noSize: [], offscreen: [] };
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  };
  const label = (el) => {
    const t = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${t}"`;
  };
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    // sticks out past the right edge of the screen (ignoring things scrolled inside their own box)
    if (r.right > vw + 1 && !el.closest("[data-allow-x], .overflow-x-auto, .overflow-x-scroll, svg")) {
      let p = el.parentElement, inside = false;
      while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") { inside = true; break; } p = p.parentElement; }
      if (!inside && out.overflowX.length < 8) out.overflowX.push(`${label(el)} right=${Math.round(r.right)}`);
    }
    // text cut off by its own box
    if (el.children.length === 0 && el.textContent.trim()) {
      const s = getComputedStyle(el);
      if ((s.overflow === "hidden" || s.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== "ellipsis" && out.clipped.length < 8) out.clipped.push(`${label(el)} ${el.scrollWidth}>${el.clientWidth}`);
    }
    // tap targets
    const tag = el.tagName;
    if ((tag === "BUTTON" || tag === "A" || (tag === "INPUT" && el.type !== "hidden") || el.getAttribute("role") === "button") && out.small.length < 12) {
      if ((r.height < 44 || r.width < 44) && !(tag === "A" && el.closest("p, li") && r.width > 60)) out.small.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    if (tag === "IMG" && (!el.getAttribute("width") || !el.getAttribute("height")) && !el.className.includes("w-") && out.noSize.length < 4) out.noSize.push(label(el));
  }
  return out;
}

(async () => {
  const only = (process.env.DEVICES || "").split(",").filter(Boolean);
  const names = only.length ? only : Object.keys(DEVICES);
  const findings = [];
  const browsers = {};
  for (const name of names) {
    const d = DEVICES[name];
    if (!d) continue;
    browsers[d.engine] ??= await pw[d.engine].launch();
    for (const screen of SCREENS) {
      const ctx = await browsers[d.engine].newContext({
        viewport: { width: d.w, height: d.h },
        deviceScaleFactor: d.dpr,
        isMobile: d.ua !== "desktop",
        hasTouch: d.ua !== "desktop",
        userAgent: UA[d.ua],
      });
      await ctx.addInitScript(lib.seedScript(screen.seed, { device: "11111111-1111-4111-8111-111111111111" }));
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
      page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 160)));
      // the server calls the app makes are not what this checks
      await page.route("**/api/**", (r) => r.fulfill({ status: 204, body: "" }));
      await page.goto(BASE + screen.url, { waitUntil: "load", referer: BASE + "/" });
      await page.waitForTimeout(900);
      // first-run shows its overlay; screenshot that for "fresh" app screens separately (see audit-flow)
      const r = await page.evaluate(inspect);
      const dir = path.join(__dirname, "shots", name);
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${screen.name}.png`), fullPage: false });
      const bad = [];
      if (r.scrollW > r.vw + 1) bad.push(`page scrolls sideways: ${r.scrollW} > ${r.vw}`);
      if (r.overflowX.length) bad.push("sticks out: " + r.overflowX.join("; "));
      if (r.clipped.length) bad.push("clipped: " + r.clipped.join("; "));
      if (r.small.length) bad.push("small tap targets: " + r.small.join("; "));
      if (errors.length) bad.push("console: " + [...new Set(errors)].join(" | "));
      if (bad.length) findings.push({ device: `${name} ${d.w}x${d.h}`, screen: screen.name, bad });
      await ctx.close();
    }
  }
  for (const b of Object.values(browsers)) await b.close();
  if (!findings.length) console.log("no findings");
  for (const f of findings) { console.log(`\n${f.device}  /  ${f.screen}`); for (const b of f.bad) console.log("   - " + b); }
  console.log(`\n${findings.length} screens with findings`);
})();

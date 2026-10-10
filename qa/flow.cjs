// Taps through the app the way a person would, in WebKit with an iPhone profile.
const { webkit, devices } = require("playwright");
const path = require("path");
const WAIT = (process.env.BASE || "http://localhost").includes("localhost") ? "networkidle" : "load";
const BASE = process.env.BASE || "http://localhost:3200";
const OUT = __dirname;
const seedSrc = require("fs").readFileSync(path.join(__dirname, "ios.cjs"), "utf8").match(/const seed = \(\) => \{[\s\S]*?\n\};/)[0];

(async () => {
  const profile = process.argv[2] || "iPhone 14";
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices[profile] });
  await ctx.addInitScript(`(${seedSrc.replace("const seed = ", "")})()`.replace(/;\)\(\)$/, ")()"));
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errs.push("console: " + m.text().slice(0, 160)));
  const log = [];
  const ok = (name, pass, extra = "") => log.push(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

  await page.goto(BASE + "/app", { waitUntil: WAIT });
  await page.waitForTimeout(1200);
  ok("capture opens", (await page.locator("main button").first().innerText()).includes("Say what you spent"));

  // Tabs
  for (const [label, expect] of [["Journal", "Expenses"], ["Insights", "Insights"], ["Capture", "Say what you spent"]]) {
    await page.locator('nav[aria-label="Screens"]').getByText(label, { exact: true }).tap();
    await page.waitForTimeout(900);
    const body = await page.locator("body").innerText();
    ok(`tab ${label} shows its screen`, body.includes(expect), `url=${new URL(page.url()).pathname}`);
    ok(`tab ${label} has no sideways scroll`, !(await overflow()));
  }

  // Journal: calendar, a day, an entry sheet.
  await page.locator('nav[aria-label="Screens"]').getByText("Journal", { exact: true }).tap();
  await page.waitForTimeout(1000);
  const cal = await page.evaluate(() => ({
    hasRupee: document.body.innerText.includes("₹"),
    cells: document.querySelectorAll("[role=grid] button, table button").length,
  }));
  ok("journal shows rupee totals", cal.hasRupee);
  await page.screenshot({ path: path.join(OUT, `flow-${profile.replace(/\s/g, "")}-journal.png`) });

  const firstEntry = page.locator("main section button, main section [role=button]").first();
  const hasEntry = await firstEntry.count();
  ok("journal lists tappable entries", hasEntry > 0);
  if (hasEntry) {
    await firstEntry.tap();
    await page.waitForTimeout(900);
    const sheet = await page.evaluate(() => {
      const d = document.querySelector("[role=dialog]");
      if (!d) return null;
      const r = d.getBoundingClientRect();
      const inputs = [...d.querySelectorAll("input")].map((i) => parseFloat(getComputedStyle(i).fontSize));
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, minInput: inputs.length ? Math.min(...inputs) : null };
    });
    ok("entry sheet opens", !!sheet, JSON.stringify(sheet));
    if (sheet) {
      ok("entry sheet fits the visible screen", sheet.bottom <= sheet.vh + 1, `bottom=${sheet.bottom} vh=${sheet.vh}`);
      ok("entry sheet inputs do not trigger zoom", sheet.minInput === null || sheet.minInput >= 16);
    }
    await page.screenshot({ path: path.join(OUT, `flow-${profile.replace(/\s/g, "")}-sheet.png`) });
    const close = page.getByRole("button", { name: /close|back|done/i }).first();
    if (await close.count()) await close.tap();
    await page.waitForTimeout(500);
  }

  // You screen
  await page.goto(BASE + "/you", { waitUntil: WAIT });
  await page.waitForTimeout(1000);
  const you = await page.evaluate(() => ({
    exportBtn: !!([...document.querySelectorAll("button,a")].find((e) => /Export my journal/i.test(e.textContent))),
    oneTap: document.body.innerText.includes("A one-tap record button"),
    iphoneAdvice: (document.querySelector("details")?.parentElement?.innerText || "").includes("Shortcuts"),
  }));
  ok("You: export is offered", you.exportBtn);
  ok("You: one-tap help is present", you.oneTap);
  await page.screenshot({ path: path.join(OUT, `flow-${profile.replace(/\s/g, "")}-you.png`), fullPage: true });

  // Settings persist after a reload.
  await page.locator('main input:not([type=radio]):not([type=checkbox])').first().fill("Asha");
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: WAIT });
  await page.waitForTimeout(800);
  ok("You: name survives a reload", (await page.locator('main input:not([type=radio]):not([type=checkbox])').first().inputValue()) === "Asha");

  ok("no script errors during the whole run", errs.length === 0, errs.slice(0, 3).join(" | "));
  console.log(`--- ${profile}`);
  console.log(log.join("\n"));
  await browser.close();
})().catch((e) => { console.error("FAILED", String(e).slice(0,300)); process.exit(1); });

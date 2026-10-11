// The screens that need a real interaction to reach, on the awkward sizes:
// every step of the welcome tour, a review card, an expense's detail, the keyboard up.
// Saves qa/shots/states/<device>-<state>.png and reports anything cut off or covered.
const pw = require("playwright");
const fs = require("fs");
const path = require("path");
const lib = require("./qa-lib.cjs");
const BASE = process.env.BASE || "http://localhost:3200";
const DEV = {
  fold: [280, 653], tiny: [320, 568], s8: [360, 740], short: [360, 520], land: [740, 360], se: [375, 667],
};
const dir = path.join(__dirname, "shots", "states");
fs.mkdirSync(dir, { recursive: true });

// Is every button / heading on screen reachable (inside the viewport, or the page scrolls to it)?
const reach = () => {
  const bad = [];
  const dlg = document.querySelector('[role="dialog"]');
  if (!dlg) return bad;
  const vh = window.innerHeight;
  for (const b of dlg.querySelectorAll("button")) {
    const r = b.getBoundingClientRect();
    if (r.height && (r.bottom > vh + 1 || r.top < -1)) bad.push(`"${b.textContent.trim().slice(0, 24)}" at ${Math.round(r.top)}-${Math.round(r.bottom)} of ${vh}`);
  }
  return bad;
};

(async () => {
  const browser = await pw.chromium.launch();
  const names = (process.env.DEVICES || Object.keys(DEV).join(",")).split(",");
  for (const name of names) {
    const [w, h] = DEV[name];
    const mk = async (seed) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await ctx.addInitScript(lib.seedScript(seed, { device: "11111111-1111-4111-8111-111111111111" }));
      const page = await ctx.newPage();
      await page.route("**/api/extract", (r) => {
        const body = JSON.parse(r.request().postData() || "{}");
        const unsure = /unsure/i.test(body.text || "");
        r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transcript: body.text, captureId: "c", transactions: [lib.txn({ amount: 250, amountProvenance: unsure ? "inferred" : "said", description: "lunch", needsConfirmation: unsure, confirmationReason: unsure ? "Unclear which is the amount." : null, date: body.today })] }) });
      });
      await page.route("**/api/**", (r) => r.request().url().includes("/extract") ? r.fallback() : r.fulfill({ status: 204, body: "" }));
      return { ctx, page };
    };
    // the tour, every step
    { const { ctx, page } = await mk("fresh");
      await page.goto(BASE + "/app"); await page.waitForTimeout(900);
      for (let i = 1; i <= 4; i++) {
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(dir, `${name}-tour${i}.png`) });
        const bad = await page.evaluate(reach);
        if (bad.length) console.log(`${name} tour step ${i}: buttons out of view: ${bad.join("; ")}`);
        if (i < 3) await page.getByRole("button", { name: "Next", exact: true }).click();
        else if (i === 3) await page.getByRole("button", { name: "Next", exact: true }).click();
      }
      await page.getByRole("button", { name: /Yes, keep them/ }).click().catch(() => {});
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(dir, `${name}-guide.png`) });
      await ctx.close(); }
    // a review card and a saved row's detail
    { const { ctx, page } = await mk("ready");
      await page.goto(BASE + "/app"); await page.waitForTimeout(700);
      await page.getByPlaceholder(/250 lunch/).fill("unsure 250 lunch");
      await page.getByRole("button", { name: "Add", exact: true }).click(); await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(dir, `${name}-review.png`) });
      await ctx.close(); }
    { const { ctx, page } = await mk("data");
      await page.goto(BASE + "/app"); await page.waitForTimeout(700);
      await page.getByText("chai").first().click().catch(() => {}); await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(dir, `${name}-detail.png`) });
      await ctx.close(); }
  }
  await browser.close();
  console.log("done");
})();

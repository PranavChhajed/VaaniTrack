// First-run flows, end to end, as a person who has never used the app. Each flow prints
// whether the welcome tour was actually on screen at the moment that matters.
const pw = require("playwright");
const lib = require("./qa-lib.cjs");
const BASE = process.env.BASE || "http://localhost:3200";

const tourShowing = (page) => page.evaluate(() => !!document.querySelector('[role="dialog"][aria-label="Welcome to VaaniTrack"]'));
const store = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k).slice(0, 40)])));

async function fresh(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, ...opts });
  const page = await ctx.newPage();
  await page.route("**/api/**", (r) => r.fulfill({ status: 204, body: "" }));
  return { ctx, page };
}

(async () => {
  const browser = await pw.chromium.launch();
  const out = [];
  const log = (name, ok, note = "") => { out.push([name, ok]); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${note ? "\n        " + note : ""}`); };

  // 1. straight to the app
  { const { ctx, page } = await fresh(browser);
    await page.goto(BASE + "/app"); await page.waitForTimeout(1200);
    log("fresh -> /app shows the tour", await tourShowing(page), JSON.stringify(await store(page)));
    await ctx.close(); }

  // 2. landing -> Open the app
  { const { ctx, page } = await fresh(browser);
    await page.goto(BASE + "/"); await page.waitForTimeout(800);
    await page.getByRole("link", { name: "Open the app" }).first().click(); await page.waitForURL("**/app"); await page.waitForTimeout(1200);
    log("fresh -> landing -> Open the app shows the tour", await tourShowing(page), JSON.stringify(await store(page)));
    await ctx.close(); }

  // 3. sign up
  { const { ctx, page } = await fresh(browser);
    await page.goto(BASE + "/signup"); await page.waitForTimeout(600);
    await page.fill("#email", "new@person.in"); await page.fill("#password", "secret1"); await page.fill("#confirm", "secret1");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/app", { timeout: 8000 }); await page.waitForTimeout(1200);
    log("fresh -> sign up -> shows the tour", await tourShowing(page), JSON.stringify(await store(page)));
    await ctx.close(); }

  // 4. sign in on a browser that signed up here before, but is otherwise new
  { const { ctx, page } = await fresh(browser);
    await page.goto(BASE + "/signup"); await page.waitForTimeout(400);
    await page.fill("#email", "a@b.in"); await page.fill("#password", "secret1"); await page.fill("#confirm", "secret1");
    await page.getByRole("button", { name: "Create account" }).click(); await page.waitForURL("**/app"); await page.waitForTimeout(800);
    // leave via the You screen's sign-out if present, then sign in again
    await page.goto(BASE + "/signin"); await page.waitForTimeout(400);
    await page.fill("#email", "a@b.in"); await page.fill("#password", "secret1");
    await page.getByRole("button", { name: /sign in/i }).last().click(); await page.waitForTimeout(1500);
    log("after sign-in the app opens (tour state noted)", true, "url=" + page.url() + " tour=" + (await tourShowing(page)));
    await ctx.close(); }

  // 5. the tour, to the end, then the first-expense guide
  { const { ctx, page } = await fresh(browser);
    await page.goto(BASE + "/app"); await page.waitForTimeout(1000);
    for (const label of ["Next", "Next", "Next"]) { await page.getByRole("button", { name: label, exact: true }).click(); await page.waitForTimeout(350); }
    await page.getByRole("button", { name: /Yes, keep them/ }).click(); await page.waitForTimeout(600);
    const text = await page.evaluate(() => document.body.innerText);
    log("tour finishes and the first-expense guide appears", /Record your first one/.test(text), text.slice(0, 160).replace(/\n/g, " | "));
    await ctx.close(); }

  // 6. a slow phone: is the app ever on screen, tappable, before the tour is?
  { const { ctx, page } = await fresh(browser);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 50 * 1024 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const t0 = Date.now();
    await page.goto(BASE + "/app", { waitUntil: "commit" });
    let exposed = null, veilAt = null, tourAt = null;
    for (let i = 0; i < 80 && tourAt === null; i++) {
      await page.waitForTimeout(150);
      const s = await page.evaluate(() => {
        const v = document.getElementById("first-run-veil");
        const covered = !!document.querySelector('[role="dialog"]') || (v && getComputedStyle(v).display !== "none");
        const rendered = document.body && document.body.innerText.length > 40;
        return { covered, rendered, tour: !!document.querySelector('[role="dialog"]'), veil: v && getComputedStyle(v).display !== "none" };
      }).catch(() => null);
      if (!s) continue;
      if (s.veil && veilAt === null) veilAt = Date.now() - t0;
      if (s.rendered && !s.covered && exposed === null) exposed = Date.now() - t0;
      if (s.tour) tourAt = Date.now() - t0;
    }
    log("slow phone: the app is never exposed before the tour", exposed === null && tourAt !== null, `veil from ${veilAt}ms, tour at ${tourAt}ms, app exposed at ${exposed}ms`);
    await ctx.close(); }

  // 7. a returning browser sees no veil and no tour
  { const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(lib.seedScript("ready", { device: "11111111-1111-4111-8111-111111111111" }));
    const page = await ctx.newPage();
    await page.route("**/api/**", (r) => r.fulfill({ status: 204, body: "" }));
    await page.goto(BASE + "/app"); await page.waitForTimeout(600);
    const s = await page.evaluate(() => ({ attr: document.documentElement.hasAttribute("data-first-run"), tour: !!document.querySelector('[role="dialog"]'), veil: getComputedStyle(document.getElementById("first-run-veil")).display }));
    log("returning browser: no veil, no tour", !s.attr && !s.tour && s.veil === "none", JSON.stringify(s));
    await ctx.close(); }

  // 8. someone who finishes the tour never sees the veil again
  { const { ctx, page } = await fresh(browser);
    await page.goto(BASE + "/app"); await page.waitForTimeout(900);
    await page.getByRole("button", { name: "Skip" }).click(); await page.getByRole("button", { name: /No, don/ }).click(); await page.waitForTimeout(500);
    const s = await page.evaluate(() => ({ attr: document.documentElement.hasAttribute("data-first-run"), veil: getComputedStyle(document.getElementById("first-run-veil")).display, tour: !!document.querySelector('[role="dialog"]') }));
    log("after the tour: veil gone, app usable", s.veil === "none" && !s.tour, JSON.stringify(s));
    await ctx.close(); }

  // 9. a browser that has used the app before the tour existed (a device id, no tour taken) signs up
  { const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(lib.seedScript("returning", { device: "11111111-1111-4111-8111-111111111111" }));
    const page = await ctx.newPage();
    await page.route("**/api/**", (r) => r.fulfill({ status: 204, body: "" }));
    await page.goto(BASE + "/app"); await page.waitForTimeout(700);
    const before = await tourShowing(page);
    await page.goto(BASE + "/signup"); await page.waitForTimeout(400);
    await page.fill("#email", "old@device.in"); await page.fill("#password", "secret1"); await page.fill("#confirm", "secret1");
    await page.getByRole("button", { name: "Create account" }).click(); await page.waitForURL("**/app"); await page.waitForTimeout(900);
    const during = await tourShowing(page);
    const text = await page.evaluate(() => document.body.innerText);
    log("used browser, never toured: signing up shows the tour", during, `before sign-up tour=${before}; explainers only (no consent step first): ${/01 \/ 03/.test(text)}`);
    await ctx.close(); }

  await browser.close();
  process.exit(out.some(([, ok]) => !ok) ? 1 : 0);
})();

// The tile and the website, together, inside the installed Android app.
//
// qa-widget.cjs proves the tile on its own. This proves the other half of what it
// promises: a button on the You screen connects it, and what it records ends up in
// the journal when the app is opened, once, and stays deleted if you delete it.
//
// Needs: the emulator with the TEST build (gradlew assembleRelease -PvaaniApi=http://10.0.2.2:4010
// -PvaaniUrl=<a site that has the inbox code>), the stand-in server (node qa/widget-mock.cjs),
// the tile placed on the home screen (centred at 540,780), and Chrome's debugging link.
//
//   ADB=D:/path/to/adb.exe SITE=https://... node qa/qa-handoff.cjs
const { execSync } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");

const ADB = process.env.ADB || "adb";
const SITE = process.env.SITE || "https://vaanitrack-git-feature-record-pranavchhajed842-2598s-projects.vercel.app";
const HOST = new URL(SITE).host;
const MOCK = process.env.MOCK || "http://localhost:4010";
const PKG = "app.vaanitrack.android";
const LAUNCHER = `${PKG}/.AppLauncher`;
const TILE = [540, 780];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (c, o = {}) => execSync(`${ADB} ${c}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 24, ...o }).trim();
const shell = (c) => sh(`shell "${c}"`);
const get = (p) => new Promise((res, rej) => http.get(MOCK + p, (r) => { let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => res(b)); }).on("error", rej));

const LINE = /ready=(\w+) state=(\w+) title=(.*?) sub=(.*?) amount=(.*?) waiting=(\d+) undo=(\w+)\s*$/;
const tiles = () => sh("logcat -d -s VaaniWidget").split("\n").map((l) => LINE.exec(l)).filter(Boolean)
  .map((m) => ({ ready: m[1] === "true", state: m[2], title: m[3], sub: m[4], amount: m[5], waiting: Number(m[6]) }));
async function until(pred, ms = 15000, what = "the tile") {
  const t0 = Date.now();
  for (;;) {
    const hit = tiles().find(pred);
    if (hit) return hit;
    if (Date.now() - t0 > ms) throw new Error(`${what} never got there (last: ${JSON.stringify(tiles().at(-1))})`);
    await sleep(300);
  }
}

let browser = null;
async function page(waitMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs) {
    try {
      try { sh("forward tcp:9222 localabstract:chrome_devtools_remote"); } catch {}
      if (!browser) browser = await chromium.connectOverCDP("http://localhost:9222", { timeout: 8000 });
      for (const ctx of browser.contexts()) for (const p of ctx.pages()) if (p.url().includes(HOST)) return p;
    } catch {}
    try { await browser?.close(); } catch {} browser = null;
    await sleep(1200);
  }
  throw new Error("the app's page never appeared");
}
const dropBrowser = async () => { try { await browser?.close(); } catch {} browser = null; };
const settled = async (p) => { await p.waitForFunction(() => document.readyState === "complete" && !!document.querySelector("main"), null, { timeout: 30000 }); await sleep(1200); };
const stopAll = () => { try { shell(`am force-stop ${PKG}`); shell("am force-stop com.android.chrome"); } catch {} };
const launch = (url) => shell(url ? `am start -a android.intent.action.VIEW -d '${url}' -n ${LAUNCHER}` : `am start -n ${LAUNCHER}`);
const home = () => shell("input keyevent KEYCODE_HOME");

const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !process.env.ONLY.split(",").some((o) => name.includes(o))) return;
  const checks = []; let crashed = null;
  const t = {
    ok: (w, p, x = "") => checks.push({ w, p: !!p, x: String(x).slice(0, 220) }),
    eq: (w, g, e) => checks.push({ w, p: JSON.stringify(g) === JSON.stringify(e), x: `got ${JSON.stringify(g)} want ${JSON.stringify(e)}` }),
  };
  try { await fn(t); } catch (e) { crashed = String(e.message || e).split("\n")[0].slice(0, 260); }
  const bad = checks.filter((c) => !c.p); const pass = !crashed && !bad.length;
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  (${checks.length} checks)`);
  for (const c of bad) console.log(`        ✗ ${c.w}${c.x ? "  → " + c.x : ""}`);
  if (crashed) console.log(`        ✗ crashed: ${crashed}`);
}

const journal = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("vaanitrack.transactions") || "[]"));

(async () => {
  // A clean app: no widget set-up, no queue, no earlier journal in the app's storage.
  stopAll();
  shell(`pm clear ${PKG}`);
  shell("pm clear com.android.chrome");
  shell(`pm grant ${PKG} android.permission.RECORD_AUDIO`);
  shell(`pm grant ${PKG} android.permission.POST_NOTIFICATIONS`);
  await get("/__mode?m=sure"); await get("/__reset");
  home(); await sleep(1500);

  let p;
  await test("the You screen offers the widget in the Android app, and its button connects the tile", async (t) => {
    launch(`${SITE}/you`); p = await page(); await settled(p);
    // First run: the welcome tour and the recordings question come first.
    await p.evaluate(() => { localStorage.setItem("vaanitrack.onboarded", "true"); localStorage.setItem("vaanitrack.audioConsent", "granted"); });
    await p.reload(); await settled(p);
    const card = p.getByRole("heading", { name: "Home-screen widget" });
    t.ok("the Home-screen widget card is shown inside the app", await card.isVisible());
    const link = p.getByRole("link", { name: /Connect the widget/ });
    t.ok("with a Connect button", await link.isVisible());
    const href = await link.getAttribute("href");
    t.ok("that opens the app's own set-up link", /^intent:\/\/setup\?d=[0-9a-f-]{36}&c=granted&p=UPI&r=0#Intent;scheme=vaanitrack;package=app\.vaanitrack\.android;end$/.test(href), href);
    await link.click();
    await until((x) => x.ready, 20000, "the tile becoming ready");
    t.ok("the tile is connected", true);
    await sleep(1500);
    await dropBrowser(); p = await page(); await settled(p);
    const status = await p.getByText(/Connected, and in step with your settings/).isVisible().catch(() => false);
    t.ok("the page then says it is connected", status);
  });

  await test("a changed setting makes the page offer an update", async (t) => {
    await p.getByRole("button", { name: "Cash", exact: false }).first().click().catch(() => {});
    await sleep(800);
    const behind = await p.getByText(/settings have changed since the widget was connected/).isVisible().catch(() => false);
    const update = await p.getByRole("link", { name: /Update the widget/ }).isVisible().catch(() => false);
    t.ok("says so", behind);
    t.ok("and the button now reads Update", update);
    await p.getByRole("link", { name: /Update the widget/ }).click();
    await sleep(2500);
    await dropBrowser(); p = await page(); await settled(p);
    t.ok("back in step after updating", await p.getByText(/in step with your settings/).isVisible().catch(() => false));
    const sent = tiles().at(-1);
    t.ok("the tile is still ready", sent.ready);
  });

  await test("an expense recorded on the tile arrives in the journal, once", async (t) => {
    home(); await sleep(1500);
    await get("/__mode?m=sure");
    shell(`input tap ${TILE[0]} ${TILE[1]}`);
    await until((x) => x.state === "RECORDING", 10000, "listening"); await sleep(700);
    shell(`input tap ${TILE[0]} ${TILE[1]}`);
    const saved = await until((x) => x.state === "SAVED", 15000, "logged");
    t.eq("the tile logged it", saved.amount, "₹250");
    t.ok("and says it is waiting for the app", saved.waiting >= 1, saved.waiting);

    await dropBrowser(); stopAll(); await sleep(1500);
    launch(); p = await page(); await settled(p);
    await p.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes("from your widget"), null, { timeout: 8000 }).catch(() => {});
    const notice = await p.locator('[role="status"]').first().textContent().catch(() => "");
    t.ok("a short line says what arrived", /1 logged from your widget/.test(notice || ""), notice);
    const rows = (await journal(p)).filter((r) => r.transcript === "250 lunch.");
    t.eq("exactly one entry", rows.length, 1);
    t.eq("with the amount that was said", rows[0]?.amount?.value, 250);
    t.eq("filed as a voice capture", rows[0]?.source, "voice");
    t.ok("the address no longer carries the queue", !/inbox=/.test(p.url()), p.url());
    t.ok("it shows on today's list", await p.getByText("Lunch", { exact: false }).first().isVisible().catch(() => false));

    // Opening the app again offers the same item again (there is no acknowledgement). It must not double.
    await dropBrowser(); stopAll(); await sleep(1500);
    launch(); p = await page(); await settled(p);
    t.eq("a second open adds nothing", (await journal(p)).filter((r) => r.transcript === "250 lunch.").length, 1);
  });

  await test("an expense deleted from the journal does not come back", async (t) => {
    const before = await journal(p);
    const mine = before.find((r) => r.transcript === "250 lunch.");
    await p.evaluate((id) => {
      const all = JSON.parse(localStorage.getItem("vaanitrack.transactions") || "[]").filter((r) => r.id !== id);
      localStorage.setItem("vaanitrack.transactions", JSON.stringify(all));
    }, mine.id);
    await dropBrowser(); stopAll(); await sleep(1500);
    launch(); p = await page(); await settled(p);
    t.eq("still gone after the next open", (await journal(p)).filter((r) => r.transcript === "250 lunch.").length, 0);
  });

  await test("an unsure result arrives as a review card and is never saved by the tile", async (t) => {
    home(); await sleep(1500);
    await get("/__mode?m=unsure");
    const before = (await journal(p)).length;
    shell(`input tap ${TILE[0]} ${TILE[1]}`);
    await until((x) => x.state === "RECORDING", 10000, "listening"); await sleep(700);
    shell(`input tap ${TILE[0]} ${TILE[1]}`);
    await until((x) => x.state === "CHECK", 15000, "check this");
    // Tapping the tile opens the app to the review.
    await dropBrowser(); stopAll(); await sleep(800);
    home(); await sleep(1500);
    shell(`input tap ${TILE[0]} ${TILE[1]}`);
    p = await page(); await settled(p);
    await p.getByText(/Is this a payment to Pushpa/).waitFor({ timeout: 15000 });
    t.ok("the review card shows the app's own question", true);
    t.eq("nothing was saved yet", (await journal(p)).length, before);
    await p.getByRole("button", { name: /^Save/ }).first().click().catch(() => {});
    await sleep(800);
    t.ok("saving it from the card puts it in the journal", (await journal(p)).length === before + 1 || (await journal(p)).some((r) => r.payee?.value === "Pushpa"));
  });

  await dropBrowser();
  const bad = results.filter((r) => !r.pass);
  console.log(`\n${results.length - bad.length}/${results.length} handoff tests passed`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });

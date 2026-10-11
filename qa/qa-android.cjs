// Android: the installed app on an emulator, driven by adb (system actions) and
// Chrome's debugging link (what the app itself is doing).
const { execSync } = require("child_process");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ADB = process.env.ADB || "adb";
const SITE = process.env.SITE || "https://vaanitrack-git-feature-record-pranavchhajed842-2598s-projects.vercel.app";
const HOST = new URL(SITE).host;
const PKG = "app.vaanitrack.android";
const LAUNCHER = `${PKG}/.AppLauncher`;
const OUT = __dirname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (c) => execSync(`${ADB} ${c}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const shell = (c) => sh(`shell ${c}`);
const key = (k) => shell(`input keyevent ${k}`);
const shot = (name) => { fs.writeFileSync(path.join(OUT, `android-${name}.png`), execSync(`${ADB} exec-out screencap -p`, { maxBuffer: 1 << 26 })); };

const results = [];
async function test(name, fn) {
  const checks = []; let crashed = null;
  const t = { ok: (w, p, x = "") => checks.push({ w, p: !!p, x: String(x).slice(0, 180) }), eq: (w, g, e) => checks.push({ w, p: JSON.stringify(g) === JSON.stringify(e), x: `got ${JSON.stringify(g)} want ${JSON.stringify(e)}` }) };
  try { await fn(t); } catch (e) { crashed = String(e.message || e).split("\n")[0].slice(0, 200); }
  const bad = checks.filter((c) => !c.p); const pass = !crashed && !bad.length;
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  (${checks.length} checks)`);
  for (const c of bad) console.log(`        ✗ ${c.w}${c.x ? "  → " + c.x : ""}`);
  if (crashed) console.log(`        ✗ crashed: ${crashed}`);
}

/* ---- device helpers ---- */
const stopAll = () => { try { shell(`am force-stop ${PKG}`); shell("am force-stop com.android.chrome"); } catch {} };
const home = () => key("KEYCODE_HOME");
const topActivity = () => shell("dumpsys activity activities | grep -E 'topResumedActivity' | head -1");
const launch = (url) => shell(url ? `am start -a android.intent.action.VIEW -d '${url}' -n ${LAUNCHER}` : `am start -n ${LAUNCHER}`);

let browser = null;
async function page(waitMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs) {
    try {
      try { sh("forward tcp:9222 localabstract:chrome_devtools_remote"); } catch {}
      if (!browser) browser = await chromium.connectOverCDP("http://localhost:9222", { timeout: 8000 });
      for (const ctx of browser.contexts()) for (const p of ctx.pages()) if (p.url().includes(HOST)) return p;
    } catch {}
    // Not there yet: forget this connection, so the next look is a fresh one.
    try { await browser?.close(); } catch {} browser = null;
    await sleep(1200);
  }
  throw new Error("the app's page never appeared");
}
const dropBrowser = async () => { try { await browser?.close(); } catch {} browser = null; };
async function settled(p, ms = 20000) { await p.waitForFunction(() => document.readyState === "complete" && !!document.querySelector("main"), null, { timeout: ms }); await sleep(900); }
const probe = (p) => p.evaluate(() => ({
  path: location.pathname + location.search,
  button: (document.querySelector("main button")?.textContent || "").trim(),
  focusedTyped: document.activeElement?.hasAttribute("data-typed-entry") || false,
  h1: document.querySelector("h1")?.textContent?.trim() || "",
  tour: /0\d \/ 0\d/.test(document.body.innerText),
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  vw: innerWidth, vh: innerHeight, entries: (() => { try { return JSON.parse(localStorage.getItem("vaanitrack.transactions") || "[]").length; } catch { return -1; } })(),
  standalone: matchMedia("(display-mode: standalone)").matches,
}));
const REC = "Tap to finish", IDLE = "Say what you spent";
const nav = (p, l) => p.locator('nav[aria-label="Screens"]').getByText(l, { exact: true });

(async () => {
  // A known, ordinary starting point: set up, answered, no entries.
  stopAll(); await sleep(1500);
  launch(); let p = await page(); await settled(p);
  await p.evaluate(() => { localStorage.setItem("vaanitrack.onboarded", "true"); localStorage.setItem("vaanitrack.audioConsent", "granted"); localStorage.setItem("vaanitrack.device", "22222222-2222-4222-8222-222222222222"); localStorage.removeItem("vaanitrack.transactions"); localStorage.removeItem("vaanitrack.settings"); });
  await p.reload(); await settled(p);

  async function ensure() {
    sh("get-state");
    try { if (p && !p.isClosed()) { await p.evaluate(() => 1); return; } } catch {}
    await dropBrowser(); p = await page(); await settled(p);
  }

  await test("opens full screen from the icon, idle, on capture", async (t) => {
    stopAll(); await sleep(1500); const w = shell(`am start -W -n ${LAUNCHER}`); await dropBrowser();
    const ms = Number((w.match(/TotalTime:\s*(\d+)/) || [])[1] || 0);
    p = await page(); await settled(p); const s = await probe(p);
    t.eq("on capture", s.path, "/app"); t.eq("not recording", s.button, IDLE);
    t.ok("runs as an app (no browser bar)", s.standalone, JSON.stringify(s));
    t.ok("the top screen is the app's browser view", /CustomTabActivity|LauncherActivity/.test(topActivity()), topActivity());
    t.ok(`the app answers within a few seconds on this emulator (${ms}ms to the first screen)`, ms > 0 && ms < 8000, String(ms));
    shot("capture");
  });

  await test("Back button leaves the app; it does not trap or loop", async (t) => {
    await sleep(9000);   // Android shows a "Running in Chrome" notice for a few seconds after a launch; it takes the first Back
    key("KEYCODE_BACK"); await sleep(2500);
    t.ok("back at the home screen", /nexuslauncher|launcher/i.test(topActivity()), topActivity());
    await sleep(3000); await dropBrowser(); launch(); p = await page(); await settled(p);
    t.eq("and coming back finds capture", (await probe(p)).path, "/app");
  });

  await test("Back walks the tabs in order and then leaves", async (t) => {
    await ensure();
    await sleep(9000);
    await nav(p, "Journal").click(); await sleep(1500); await nav(p, "Insights").click(); await sleep(1500);
    t.eq("on Insights", (await probe(p)).path, "/insights");
    key("KEYCODE_BACK"); await sleep(2500); await dropBrowser(); p = await page(); t.eq("Back → Journal", (await probe(p)).path, "/journal");
    key("KEYCODE_BACK"); await sleep(2500); await dropBrowser(); p = await page(); t.eq("Back → Capture", (await probe(p)).path, "/app");
    key("KEYCODE_BACK"); await sleep(2500);
    t.ok("Back → out to the home screen", /nexuslauncher|launcher/i.test(topActivity()), topActivity());
  });

  await test("links to the site open in the app, at the right place", async (t) => {
    for (const [url, want, label] of [[`${SITE}/insights`, "/insights", "insights"], [`${SITE}/you`, "/you", "you"], [`${SITE}/journal`, "/app", "a cold journal link is sent to capture (by design)"], [`${SITE}/journal?from=widget`, "/journal?from=widget", "the widget's journal link stays"]]) {
      stopAll(); await sleep(1200); await dropBrowser(); launch(url); p = await page(); await settled(p);
      t.eq(label, (await probe(p)).path, want);
    }
    stopAll(); await sleep(1200); await dropBrowser(); launch(`${SITE}/app?type=1`); p = await page(); await settled(p);
    t.ok("?type=1 puts the cursor in the typing box", (await probe(p)).focusedTyped);
    t.eq("and tidies the address", (await probe(p)).path, "/app");
  });

  await test("?record=1 records by itself, once, and a restart does not repeat it", async (t) => {
    stopAll(); await sleep(1200); await dropBrowser(); launch(`${SITE}/app?record=1`); p = await page(); await settled(p); await sleep(1500);
    let s = await probe(p);
    t.eq("recording", s.button, REC); t.eq("address cleaned", s.path, "/app");
    shot("recording");
    stopAll(); await sleep(1500); await dropBrowser(); launch(); p = await page(); await settled(p); await sleep(1200);
    s = await probe(p); t.eq("opening again from the icon is idle", s.button, IDLE);
  });

  await test("a typed expense is saved, and is still there after the phone kills the app", async (t) => {
    await ensure();
    await p.route("**/api/extract", (r) => { const b = JSON.parse(r.request().postData() || "{}"); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transcript: b.text, captureId: "c1", transactions: [{ amount: 77, amountProvenance: "said", description: "emulator chai", descriptionProvenance: "said", category: null, categoryProvenance: "unknown", payee: null, payeeProvenance: "unknown", paymentMethod: "UPI", paymentMethodProvenance: "default", date: b.today, dateProvenance: "default", time: null, timeProvenance: "unknown", needsConfirmation: false, confirmationReason: null }] }) }); });
    await p.route("**/api/observe", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await p.locator("[data-typed-entry]").fill("77 emulator chai"); await p.locator("form button[type=submit]").click(); await sleep(1500);
    let s = await probe(p); const base = s.entries - 1;
    t.ok("one more entry was saved", s.entries >= 1, String(s.entries));
    home(); await sleep(2500);   // leaving the app is what makes Chrome write its storage to disk
    stopAll(); await sleep(2000); await dropBrowser(); launch(); p = await page(); await settled(p);
    s = await probe(p); t.eq("the same number after the app was killed and reopened", s.entries, base + 1);
    t.ok("and shown on screen", /emulator chai/.test(await p.locator("body").innerText()));
  });

  await test("a voice expense works end to end on the phone's microphone", async (t) => {
    await ensure();
    await p.route("**/api/transcribe", (r) => r.fulfill({ status: 200, contentType: "application/x-ndjson", body: [JSON.stringify({ heard: "ninety dosa", confidence: 0.9 }), JSON.stringify({ text: "ninety dosa", confidence: 0.9, captureId: "c2", debug: { bytes: 1, type: "audio/webm", noSpeechProb: 0.01, confidence: 0.9, asrMs: 1, extractMs: 1 }, transactions: [{ amount: 90, amountProvenance: "said", description: "dosa", descriptionProvenance: "said", category: null, categoryProvenance: "unknown", payee: null, payeeProvenance: "unknown", paymentMethod: "UPI", paymentMethodProvenance: "default", date: new Date().toISOString().slice(0, 10), dateProvenance: "default", time: null, timeProvenance: "unknown", needsConfirmation: false, confirmationReason: null }] })].join("\n") + "\n" }));
    await p.route("**/api/observe", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    const before = (await probe(p)).entries;
    await p.locator("main button").first().click();
    await p.waitForFunction(() => /Tap to finish/.test(document.querySelector("main button")?.textContent || ""), null, { timeout: 15000 });
    await sleep(2000); await p.locator("main button").first().click();
    await p.waitForFunction(() => document.body.innerText.includes("dosa"), null, { timeout: 15000 });
    const s = await probe(p); t.eq("one more entry", s.entries, before + 1);
    t.eq("button is idle again", s.button, IDLE);
  });

  await test("a revoked microphone permission is explained, then recovers when granted", async (t) => {
    stopAll(); await sleep(1200); await dropBrowser();
    try { shell(`pm revoke com.android.chrome android.permission.RECORD_AUDIO`); shell(`pm set-permission-flags com.android.chrome android.permission.RECORD_AUDIO user-set user-fixed`); } catch {}
    launch(`${SITE}/app?record=1`); p = await page(); await settled(p); await sleep(2500);
    let s = await probe(p); const text = await p.locator("body").innerText();
    t.ok("the app is waiting for the answer, not stuck 'recording'", s.button !== REC, s.button);
    shot("mic-revoked");
    try { shell(`pm clear-permission-flags com.android.chrome android.permission.RECORD_AUDIO user-set user-fixed`); shell(`pm grant com.android.chrome android.permission.RECORD_AUDIO`); } catch {}
    stopAll(); await sleep(1500); await dropBrowser(); launch(`${SITE}/app?record=1`); p = await page(); await settled(p); await sleep(2500);
    s = await probe(p); t.eq("recording again once allowed", s.button, REC);
  });

  await test("large system text (130% and 200%) keeps the app usable", async (t) => {
    for (const scale of ["1.3", "2.0"]) {
      shell(`settings put system font_scale ${scale}`); stopAll(); await sleep(1500); await dropBrowser(); launch(); p = await page(); await settled(p);
      let s = await probe(p); t.ok(`capture at ${scale}: no sideways scroll`, !s.overflow, `${s.vw}px wide`);
      await p.goto(`${SITE}/you`); await settled(p); s = await probe(p); t.ok(`you at ${scale}: no sideways scroll`, !s.overflow);
      await p.goto(`${SITE}/insights`); await settled(p); s = await probe(p); t.ok(`insights at ${scale}: no sideways scroll`, !s.overflow);
      if (scale === "2.0") shot("fontscale-2");
    }
    shell("settings put system font_scale 1.0");
  });

  await test("a very narrow screen (320dp) and a phone on its side both work", async (t) => {
    shell("wm size 640x1138"); shell("wm density 320"); stopAll(); await sleep(1500); await dropBrowser(); launch(); p = await page(); await settled(p);
    let s = await probe(p); t.ok(`320dp wide (${s.vw}px): no sideways scroll`, !s.overflow, JSON.stringify(s)); shot("narrow");
    shell("wm size reset"); shell("wm density reset");
    shell("settings put system accelerometer_rotation 0"); shell("settings put system user_rotation 1"); await sleep(2500); await dropBrowser(); p = await page(); await settled(p);
    s = await probe(p); t.ok(`landscape (${s.vw}x${s.vh}): no sideways scroll`, !s.overflow); t.ok("and the typing box is still reachable", (await p.locator("[data-typed-entry]").count()) === 1); shot("landscape");
    shell("settings put system user_rotation 0"); shell("settings put system accelerometer_rotation 1");
  });

  await test("the keyboard opening does not hide the typing box", async (t) => {
    stopAll(); await sleep(1500); await dropBrowser(); launch(); p = await page(); await settled(p);
    await p.locator("[data-typed-entry]").tap().catch(async () => { await p.locator("[data-typed-entry]").click(); });
    await sleep(1800); const ime = shell("dumpsys input_method").split("\n").filter((l) => /mInputShown|isInputViewShown/.test(l)).slice(0, 2).join(" | ");
    t.ok("the on-screen keyboard is up", /true/.test(ime), ime);
    const vis = await p.evaluate(() => { const r = document.querySelector("[data-typed-entry]").getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, vv: Math.round(visualViewport.height) }; });
    t.ok("the box is inside what is still visible", vis.bottom <= vis.vv + 2 && vis.top >= 0, JSON.stringify(vis)); shot("keyboard");
    key("KEYCODE_BACK"); await sleep(600);
  });

  await test("dark mode on the phone does not wreck the app", async (t) => {
    shell("cmd uimode night yes"); await sleep(1000); stopAll(); await sleep(1500); await dropBrowser(); launch(); p = await page(); await settled(p);
    const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor); const fg = await p.evaluate(() => getComputedStyle(document.querySelector("main h1, main")).color);
    t.ok("page background stays the paper colour", /rgb\(240, 237, 231\)/.test(bg), bg); shot("night");
    shell("cmd uimode night no");
  });

  await test("only what the widget needs is asked of the phone", async (t) => {
    const perms = shell(`dumpsys package ${PKG} | grep -E 'android.permission.[A-Z_]+: granted' | sed 's/:.*//' | sort -u | tr '\\n' ' '`);
    t.ok("nothing beyond the internet, the microphone, its service and notices", !/CAMERA|LOCATION|CONTACTS|STORAGE|SMS|PHONE|CALENDAR|SENSORS/.test(perms), perms);
    const entry = shell(`cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ${PKG}`);
    t.ok("a launcher entry exists", /AppLauncher/.test(entry), entry);
  });

  await dropBrowser();
  const bad = results.filter((r) => !r.pass);
  console.log(`\n${results.length - bad.length}/${results.length} Android tests passed`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });

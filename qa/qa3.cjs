// Suite 3: awkward screens, text size, keyboard, history, midnight, scale, corrupt data, server checks.
const { open, test, summary, closeAll, BASE, DEVICE } = require("./qa-lib.cjs");
const [engine, profile] = (process.argv[2] || "webkit:iPhone 14").split(":");

const typed = (p) => p.locator("[data-typed-entry]");
const add = (p) => p.locator("form button[type=submit]");
const text = (p) => p.locator("body").innerText();
const nav = (p, label) => p.locator('nav[aria-label="Screens"]').getByText(label, { exact: true });
const overflowX = (p) => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

const SIZES = [
  { name: "iPhone SE 1st gen 320x568", w: 320, h: 568 },
  { name: "iPhone 8 375x667", w: 375, h: 667 },
  { name: "phone on its side 667x375", w: 667, h: 375 },
  { name: "small phone on its side 568x320", w: 568, h: 320 },
];

(async () => {
  console.log(`=== suite 3 on ${engine} / ${profile}`);

  for (const sz of SIZES) {
    await test(`first run and the recordings question work at ${sz.name}`, async (t) => {
      const { page, go, close } = await open(engine, "desktop", { seed: "fresh", context: { viewport: { width: sz.w, height: sz.h }, hasTouch: true, isMobile: true } });
      await go("/app");
      let n = 0;
      while (!(await page.getByRole("button", { name: "No, don’t" }).count()) && n++ < 6) { await page.getByRole("button", { name: "Next" }).click({ timeout: 8000 }); await page.waitForTimeout(300); }
      t.ok("every tour step's Next was reachable", n <= 4, `taps=${n}`);
      const geo = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("No, don")); const o = b.closest(".fixed"); return { reachable: o.scrollHeight >= b.getBoundingClientRect().bottom + o.scrollTop - 1, scrolls: getComputedStyle(o).overflowY }; });
      t.ok("the overlay scrolls when it must", geo.scrolls === "auto" || geo.scrolls === "scroll", JSON.stringify(geo));
      await page.getByRole("button", { name: "No, don’t" }).click({ timeout: 8000 }); await page.waitForTimeout(500);
      t.eq("answered", await page.evaluate(() => localStorage.getItem("vaanitrack.audioConsent")), "denied");
      await close();
    });

    await test(`the consent card is whole and answerable at ${sz.name}`, async (t) => {
      const { page, go, close } = await open(engine, "desktop", { seed: "returning", context: { viewport: { width: sz.w, height: sz.h }, hasTouch: true, isMobile: true } });
      await go("/app");
      const top = await page.evaluate(() => { const d = document.querySelector("[role=dialog]"); const r = d.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), vh: innerHeight }; });
      t.ok("the card's heading is not cut off at the top", top.top >= 0, JSON.stringify(top));
      await page.getByRole("button", { name: "No, don’t" }).click({ timeout: 8000 }); await page.waitForTimeout(400);
      t.eq("both answers are reachable", await page.getByRole("dialog").count(), 0);
      await close();
    });
  }

  await test("nothing is left hidden under the glass bar at the bottom of any screen", async (t) => {
    const { page, go, close } = await open(engine, profile, { seed: "full" });
    for (const [label, route] of [["Capture", "/app"], ["Journal", null], ["Insights", null], ["You", "/you"]]) {
      if (route) await go(route); else { await nav(page, label).click(); await page.waitForTimeout(800); }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(300);
      const g = await page.evaluate(() => {
        const bar = document.querySelector(".glass-bar").getBoundingClientRect();
        const kids = [...document.querySelectorAll("main > *")].filter((e) => e.getBoundingClientRect().height > 0);
        const last = kids[kids.length - 1].getBoundingClientRect();
        return { barTop: Math.round(bar.top), lastBottom: Math.round(last.bottom) };
      });
      t.ok(`${label}: the last block ends above the bar`, g.lastBottom <= g.barTop, JSON.stringify(g));
    }
    await close();
  });

  for (const w of [320, 360, 375, 390, 430, 600, 768, 1024, 1440]) {
    await test(`no sideways scroll on any screen at ${w}px wide`, async (t) => {
      const { page, go, close } = await open(engine, "desktop", { seed: "full", context: { viewport: { width: w, height: 800 }, hasTouch: w < 768, isMobile: w < 768 } });
      for (const r of ["/", "/app", "/you", "/signin", "/signup"]) { await go(r); t.ok(`${r}`, !(await overflowX(page))); }
      await go("/app"); await nav(page, "Journal").click(); await page.waitForTimeout(700); t.ok("journal", !(await overflowX(page)));
      await nav(page, "Insights").click(); await page.waitForTimeout(700); t.ok("insights", !(await overflowX(page)));
      await close();
    }, { timeout: 90000 });
  }

  for (const [zoom, label] of [[1.5, "150%"], [2, "200%"]]) {
    await test(`large text (${label}): nothing overflows and the bar's labels fit`, async (t) => {
      const { page, go, close } = await open(engine, profile, { seed: "full" });
      await page.addInitScript(`document.addEventListener("DOMContentLoaded",()=>{document.documentElement.style.fontSize="${16 * zoom}px"})`);
      await go("/app");
      t.ok("capture has no sideways scroll", !(await overflowX(page)));
      const fit = await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Screens"] a')].map((a) => [a.textContent.trim(), a.scrollWidth <= a.clientWidth + 1]));
      t.ok("tab labels are not clipped", fit.every((f) => f[1]), JSON.stringify(fit));
      await nav(page, "Insights").click(); await page.waitForTimeout(700); t.ok("insights has no sideways scroll", !(await overflowX(page)));
      await go("/you"); t.ok("you has no sideways scroll", !(await overflowX(page)));
      await close();
    }, { timeout: 90000 });
  }

  await test("keyboard only: focus order, visible focus, Enter, Escape", async (t) => {
    const { page, go, close } = await open(engine, "desktop", { seed: "full", context: { viewport: { width: 1100, height: 800 } } });
    await go("/app");
    const seen = [];
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const d = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none"); return { tag: e.tagName, label: (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || "").trim().slice(0, 24), ring: !!ring }; });
      if (d) seen.push(d);
    }
    const labels = seen.map((s) => s.label);
    t.ok("the typing box is in the tab order", seen.some((s) => /type it|Type an expense/.test(s.label) || s.tag === "INPUT"), labels.slice(0, 12).join(" | "));
    // Safari's default is that Tab skips links (Option+Tab reaches them), so on
    // that engine only controls can be expected in the Tab order.
    t.ok("all three tabs are reachable", engine === "webkit" || ["Capture", "Journal", "Insights"].every((n) => labels.some((l) => l.includes(n))), labels.join(" | "));
    t.ok("the profile link is reachable", engine === "webkit" || labels.some((l) => /^You/.test(l)));
    const noRing = seen.filter((s) => !s.ring).map((s) => s.label);
    t.ok("every focused control shows a focus ring", noRing.length === 0, "no ring on: " + noRing.join(", "));
    await page.locator("[data-typed-entry]").focus(); await page.keyboard.type("45 kbd"); await page.keyboard.press("Enter"); await page.waitForTimeout(900);
    t.ok("Enter submits from the keyboard", /kbd/.test(await text(page)));
    await page.getByRole("button", { name: /^kbd/ }).first().focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(500);
    t.eq("Enter opens a row's sheet", await page.locator("[role=dialog]").count(), 1);
    await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    const closedByEsc = (await page.locator("[role=dialog]").count()) === 0;
    t.ok("Escape closes the sheet (a keyboard user's way out)", closedByEsc);
    await close();
  });

  await test("history: Back and Forward keep the screen, the tab and the lens in step", async (t) => {
    const { page, go, close } = await open(engine, profile, { seed: "full" });
    await go("/app");
    await nav(page, "Journal").click(); await page.waitForTimeout(700);
    await nav(page, "Insights").click(); await page.waitForTimeout(700);
    const state = () => page.evaluate(() => ({ path: location.pathname, cur: document.querySelector('nav a[aria-current="page"]')?.textContent?.trim(), lens: Math.round(new DOMMatrix(getComputedStyle(document.querySelector(".glass-lens")).transform).m41) }));
    let s = await state(); t.eq("Insights", [s.path, s.cur], ["/insights", "Insights"]);
    await page.goBack(); await page.waitForTimeout(900); s = await state(); t.eq("Back → Journal", [s.path, s.cur], ["/journal", "Journal"]);
    const w = await page.evaluate(() => Math.round(document.querySelector(".glass-lens").getBoundingClientRect().width));
    t.ok("the lens moved with it", Math.abs(s.lens - w) <= 2, JSON.stringify(s));
    await page.goBack(); await page.waitForTimeout(900); s = await state(); t.eq("Back → Capture", [s.path, s.cur], ["/app", "Capture"]);
    t.eq("the lens is home", s.lens, 0);
    await page.goForward(); await page.waitForTimeout(900); s = await state(); t.eq("Forward → Journal", [s.path, s.cur], ["/journal", "Journal"]);
    await close();
  });

  await test("hammering the tabs leaves the right screen and no errors", async (t) => {
    const { page, go, state, close } = await open(engine, profile, { seed: "full" });
    await go("/app");
    const order = ["Journal", "Insights", "Capture", "Insights", "Journal", "Capture", "Journal", "Insights"];
    for (let i = 0; i < 3; i++) for (const l of order) await nav(page, l).click({ delay: 0 }).catch(() => {});
    await page.waitForTimeout(1200);
    const end = await page.evaluate(() => document.querySelector('nav a[aria-current="page"]')?.textContent?.trim());
    t.eq("the last tap won", end, "Insights");
    t.ok("the screen matches the tab", /Insights/.test(await text(page)));
    t.eq("no script errors", state.errors, []);
    await close();
  });

  await test("reduced motion: the lens does not travel, the app still works", async (t) => {
    const { page, go, state, close } = await open(engine, profile, { seed: "full", context: { reducedMotion: "reduce" } });
    await go("/app");
    const tp = await page.evaluate(() => getComputedStyle(document.querySelector(".glass-lens")).transitionProperty);
    t.ok("no transform transition", !/transform|all/.test(tp), tp);
    await nav(page, "Journal").click(); await page.waitForTimeout(1200);
    t.ok("navigation works", /Expenses/.test(await text(page)));
    t.eq("no script errors", state.errors, []);
    await close();
  });

  await test("a day rolling over at midnight is picked up without a reload", async (t) => {
    const { page, ctx, state, close } = await open(engine, profile, { seed: "full", context: { timezoneId: "Asia/Kolkata", locale: "en-IN" }, init: "" });
    await ctx.clock.install({ time: new Date("2026-10-10T23:57:00+05:30") });
    await page.goto(BASE + "/app", { waitUntil: "load" }); await page.waitForTimeout(900);
    await nav(page, "Insights").click(); await page.waitForTimeout(900);
    const lastBar = () => page.evaluate(() => { const li = document.querySelectorAll("ol[aria-label^='Spending'] > li"); return li[li.length - 1]?.textContent.trim().replace(/\s+/g, " "); });
    const before = await lastBar();
    t.ok("before midnight the last bar is Saturday", /^SaSat/.test(before || ""), before);
    await ctx.clock.runFor(6 * 60 * 1000); await page.waitForTimeout(600);
    const after = await lastBar();
    t.ok("after midnight, untouched, the last bar is Sunday", /^SuSun/.test(after || ""), after);
    await nav(page, "Capture").click(); await page.waitForTimeout(600);
    t.ok("capture's Today list is today's, not yesterday's", !/Yesterday/.test(await text(page)));
    t.eq("no script errors", state.errors, []);
    await close();
  }, { timeout: 90000 });

  await test("thousands of entries: screens stay quick and correct", async (t) => {
    const big = `(() => { if (localStorage.getItem("qa.big")) return; localStorage.setItem("qa.big","1"); const f=(v,p="said")=>({value:v,provenance:p}); const out=[]; const now=new Date();
      for (let i=0;i<3000;i++){ const d=new Date(now); d.setDate(d.getDate()-(i%400)); const o=d.getTimezoneOffset()*6e4; const iso=new Date(d.getTime()-o).toISOString().slice(0,10);
        out.push({id:"b"+i,amount:f(10+(i%90)),description:f(["chai","lunch","dosa","auto","parking"][i%5]),category:f(null,"unknown"),payee:f(null,"unknown"),paymentMethod:f("UPI","default"),date:f(iso,"default"),time:f(null,"unknown"),createdAt:d.toISOString(),source:"voice"}); }
      localStorage.setItem("vaanitrack.transactions", JSON.stringify(out)); })()`;
    const { page, go, state, close } = await open(engine, profile, { seed: "ready", init: big });
    const t0 = Date.now(); await go("/app"); const loadMs = Date.now() - t0;
    t.ok("capture opens in under 4s", loadMs < 4000, loadMs + "ms");
    const t1 = Date.now(); await nav(page, "Journal").click(); await page.getByRole("heading", { name: "Expenses" }).waitFor(); const jMs = Date.now() - t1;
    t.ok("journal opens in under 5s (was 10s+ before it drew months lazily)", jMs < 5000, jMs + "ms");
    const rowsFirst = await page.locator("main li").count();
    t.ok("it draws the recent entries first, not all 3,000", rowsFirst < 600, rowsFirst + " rows");
    const more = page.getByRole("button", { name: /Show earlier months/ });
    t.ok("and offers the rest", (await more.count()) === 1);
    await more.click(); await page.waitForTimeout(800);
    t.ok("tapping it draws more", (await page.locator("main li").count()) > rowsFirst);
    const t2 = Date.now(); await nav(page, "Insights").click(); await page.getByText("Last 7 days").first().waitFor(); const iMs = Date.now() - t2;
    t.ok("insights opens in under 3s", iMs < 3000, iMs + "ms");
    await nav(page, "Capture").click(); await page.waitForTimeout(500);
    const t3 = Date.now(); await typed(page).fill("11 speedtest"); await add(page).click(); await page.waitForFunction(() => document.body.innerText.includes("speedtest")); const aMs = Date.now() - t3;
    t.ok("adding one is quick", aMs < 2500, aMs + "ms");
    t.eq("no script errors", state.errors, []);
    await close();
  }, { timeout: 120000 });

  await test("damaged storage never crashes a screen", async (t) => {
    const wreck = `(() => { if (localStorage.getItem("qa.wreck")) return; localStorage.setItem("qa.wreck","1");
      localStorage.setItem("vaanitrack.transactions", JSON.stringify([null, 5, "x", {}, {id:"a"}, {id:"b",amount:{value:"NaN"},date:{value:"not-a-date"}}, {id:"c",amount:{value:12},description:{value:null},date:{value:"2026-10-10"},createdAt:"garbage",time:{value:"99:99"}}]));
      localStorage.setItem("vaanitrack.settings", "{not json"); })()`;
    const { page, go, state, close } = await open(engine, profile, { seed: "ready", init: wreck });
    for (const r of ["/app", "/you", "/signin"]) { await go(r); t.ok(`${r} renders`, (await text(page)).length > 40, (await text(page)).slice(0, 60)); }
    await go("/app"); await nav(page, "Journal").click(); await page.waitForTimeout(900); t.ok("journal renders", /Expenses/.test(await text(page)));
    await nav(page, "Insights").click(); await page.waitForTimeout(900); t.ok("insights renders", /Insights/.test(await text(page)));
    await nav(page, "Capture").click(); await page.waitForTimeout(500);
    await typed(page).fill("15 after the wreckage"); await add(page).click(); await page.waitForTimeout(900);
    t.ok("and a new entry still works", /after the wreckage/.test(await text(page)));
    t.eq("no script errors", state.errors, []);
    await close();
  });

  await test("an unknown address gets a proper not-found page", async (t) => {
    const { page, close } = await open(engine, profile, { mock: false });
    const res = await page.goto(BASE + "/this-is-not-a-page", { waitUntil: "load" });
    t.eq("status 404", res.status(), 404);
    t.ok("with something readable on it", (await text(page)).length > 10, (await text(page)).slice(0, 60));
    await close();
  });

  await test("the server refuses bad requests cleanly", async (t) => {
    const post = async (path, body, raw) => { const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: raw ?? JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, j }; };
    let r = await post("/api/extract", {}); t.eq("extract: no text → 400", r.status, 400);
    r = await post("/api/extract", null, "{not json"); t.eq("extract: broken JSON → 400", r.status, 400);
    r = await post("/api/extract", { text: "   " }); t.eq("extract: blank text → 400", r.status, 400);
    r = await post("/api/erase", { deviceId: "nope", scope: "everything" }); t.eq("erase: bad id → 400", r.status, 400);
    r = await post("/api/erase", { deviceId: DEVICE, scope: "the-lot" }); t.eq("erase: bad scope → 400", r.status, 400);
    r = await post("/api/erase", null, "[]"); t.eq("erase: wrong shape → 400", r.status, 400);
    r = await post("/api/erase", { deviceId: "00000000-0000-4000-8000-000000000000", scope: "recordings" }); t.ok("erase: a device with no data is a clean success", r.status === 200 && r.j?.ok === true, JSON.stringify(r));
    const g = await fetch(BASE + "/api/extract"); t.ok("extract: GET is not allowed", g.status === 405, String(g.status));
    const g2 = await fetch(BASE + "/api/erase"); t.ok("erase: GET is not allowed", g2.status === 405, String(g2.status));
    const fd = new FormData(); const tr = await fetch(BASE + "/api/transcribe", { method: "POST", body: fd }); t.ok("transcribe: no audio → 4xx", tr.status >= 400 && tr.status < 500, String(tr.status));
    const mf = await fetch(BASE + "/manifest.webmanifest"); const man = await mf.json();
    t.ok("manifest: id, scope, shortcut", man.id === "/app" && man.scope === "/" && man.shortcuts?.[0]?.url === "/app?record=1");
    for (const ic of ["/icon-192.png", "/icon-512.png", "/icon-512-maskable.png", "/apple-icon.png", "/favicon.ico"]) { const x = await fetch(BASE + ic); t.ok(`icon ${ic}`, x.ok, String(x.status)); }
    const al = await fetch(BASE + "/.well-known/assetlinks.json"); const alj = await al.json();
    t.ok("assetlinks names the app and its key", alj[0]?.target?.package_name === "app.vaanitrack.android" && /^[0-9A-F:]{95}$/.test(alj[0]?.target?.sha256_cert_fingerprints?.[0] || ""));
  });

  const bad = summary();
  await closeAll();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("SUITE CRASHED", e); process.exit(2); });

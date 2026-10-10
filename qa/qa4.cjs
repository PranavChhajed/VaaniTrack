// Suite 4: the voice path, with Chrome's fake microphone and a mocked transcriber.
const { open, test, summary, closeAll, txn } = require("./qa-lib.cjs");
const profile = process.argv[2] || "iPhone 14";
const engine = "chromium";

const typed = (p) => p.locator("[data-typed-entry]");
const add = (p) => p.locator("form button[type=submit]");
const store = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("vaanitrack.transactions") || "[]"));
const text = (p) => p.locator("body").innerText();
const nav = (p, label) => p.locator('nav[aria-label="Screens"]').getByText(label, { exact: true });
const rec = (p) => p.locator("main button").first();

// Counts microphone requests and which streams are still live.
const WRAP = `(() => { const md = navigator.mediaDevices; if (!md) return; const orig = md.getUserMedia.bind(md); window.__streams = []; window.__gum = 0;
  md.getUserMedia = async (c) => { window.__gum++; if (window.__deny) { const e = new Error("denied"); e.name = window.__deny; throw e; } const s = await orig(c); window.__streams.push(s); return s; }; })()`;
const live = (p) => p.evaluate(() => (window.__streams || []).flatMap((s) => s.getTracks()).filter((t) => t.readyState === "live").length);
const label = async (p) => ((await rec(p).innerText()) || "").trim();

async function record(p, ms = 1500) {
  await rec(p).click();
  await p.waitForFunction(() => /Tap to finish/.test(document.querySelector("main button")?.textContent || ""), null, { timeout: 8000 });
  await p.waitForTimeout(ms);
  await rec(p).click();
}

(async () => {
  console.log(`=== suite 4 on ${engine} / ${profile}`);

  await test("record, stop, and a confident result is saved with its words", async (t) => {
    const { page, go, state, close } = await open(engine, profile, { init: WRAP });
    await go("/app");
    t.eq("idle at first", await label(page), "Say what you spent");
    await rec(page).click();
    await page.waitForFunction(() => /Getting the mic ready|Tap to finish/.test(document.querySelector("main button")?.textContent || ""), null, { timeout: 5000 });
    t.ok("it warms up or is already recording", true);
    await page.waitForFunction(() => /Tap to finish/.test(document.querySelector("main button")?.textContent || ""), null, { timeout: 8000 });
    t.eq("one microphone request", await page.evaluate(() => window.__gum), 1);
    t.ok("the microphone is live while recording", (await live(page)) >= 1);
    await page.waitForTimeout(1500);
    await rec(page).click();
    await page.waitForFunction(() => document.body.innerText.includes("lunch") && document.body.innerText.includes("Logged"), null, { timeout: 8000 });
    const saved = await store(page);
    t.eq("one entry", saved.length, 1);
    t.eq("amount from the transcriber", saved[0]?.amount.value, 250);
    t.eq("marked as spoken", saved[0]?.source, "voice");
    t.eq("with the words kept", saved[0]?.transcript, "two fifty lunch");
    t.eq("the microphone is released after stopping", await live(page), 0);
    t.eq("the button is back to idle", await label(page), "Say what you spent");
    t.eq("one upload", state.transcribe.length, 1);
    t.eq("no script errors", state.errors, []);
    await close();
  });

  await test("the upload carries today, the device, the default payment and the consent", async (t) => {
    const { page, go, ctx, close } = await open(engine, profile, { init: WRAP, seedOpts: { settings: { defaultPayment: "Card" } } });
    let body = "";
    await ctx.route("**/api/transcribe", async (route) => { body = route.request().postData() || ""; await route.fallback(); });
    await go("/app"); await record(page);
    await page.waitForFunction(() => document.body.innerText.includes("Logged"), null, { timeout: 8000 });
    t.ok("audio file is attached", /name="audio"/.test(body));
    t.ok("today is sent", /name="today"\r?\n\r?\n\d{4}-\d{2}-\d{2}/.test(body));
    t.ok("the default payment is sent", /name="defaultPayment"\r?\n\r?\nCard/.test(body));
    t.ok("the device id is sent", /name="deviceId"\r?\n\r?\n[0-9a-f-]{36}/.test(body));
    t.ok("the recordings choice is sent", /name="audioConsent"|name="consent"/.test(body), body.match(/name="[a-zA-Z]+"/g)?.join(" "));
    await close();
  });

  await test("a doubtful hearing goes to the review card, not the journal", async (t) => {
    const { page, go, state, close } = await open(engine, profile, { init: WRAP });
    state.onTranscribe = () => ({ text: "twenty rahul", confidence: 0.35, transactions: [txn({ amount: 20, amountProvenance: "inferred", description: null, payee: "Rahul", needsConfirmation: true, confirmationReason: "Not sure of the amount." })] });
    await go("/app"); await record(page);
    await page.waitForFunction(() => document.body.innerText.includes("Discard"), null, { timeout: 8000 });
    t.eq("nothing saved yet", (await store(page)).length, 0);
    t.ok("what was heard is shown", /twenty rahul/.test(await text(page)));
    await page.getByRole("button", { name: "Discard" }).click(); await page.waitForTimeout(400);
    t.eq("discard keeps the journal clean", (await store(page)).length, 0);
    await close();
  });

  await test("heard but not understood: the words come back as editable text", async (t) => {
    const { page, go, state, close } = await open(engine, profile, { init: WRAP });
    state.onTranscribe = () => ({ text: "blah blah five hundred maybe", extractError: "Heard you, but couldn’t read that as an expense." });
    await go("/app"); await record(page);
    await page.waitForFunction(() => /couldn.t read/.test(document.body.innerText), null, { timeout: 8000 });
    t.ok("says so plainly", /couldn.t read that as an expense/.test(await text(page)));
    t.eq("offers the words in the box to fix", await typed(page).inputValue(), "blah blah five hundred maybe");
    await typed(page).fill("500 maybe fixed"); await add(page).click(); await page.waitForTimeout(900);
    t.eq("fixing and sending works", (await store(page)).length, 1);
    await close();
  });

  await test("the transcriber failing is survivable and retryable", async (t) => {
    const { page, go, state, close } = await open(engine, profile, { init: WRAP });
    state.onTranscribe = () => ({ fail: 500, error: "The transcriber is down." });
    await go("/app"); await record(page);
    await page.waitForFunction(() => /down|couldn|try again|wrong/i.test(document.body.innerText), null, { timeout: 8000 });
    t.ok("an error is shown", /down|couldn|try again|wrong/i.test(await text(page)));
    t.eq("the microphone is released", await live(page), 0);
    t.eq("the button is usable again", await label(page), "Say what you spent");
    state.onTranscribe = undefined; await record(page);
    await page.waitForFunction(() => document.body.innerText.includes("Logged"), null, { timeout: 8000 });
    t.eq("a retry succeeds", (await store(page)).length, 1);
    state.netDown = true; await record(page);
    await page.waitForFunction(() => /reach|connection|network|again/i.test(document.body.innerText), null, { timeout: 8000 });
    t.ok("a dropped connection is explained", true);
    t.eq("and the microphone is released again", await live(page), 0);
    await close();
  });

  await test("microphone permission refused: a clear message and typing still works", async (t) => {
    const { page, go, close } = await open(engine, profile, { init: WRAP });
    await go("/app");
    await page.evaluate(() => { window.__deny = "NotAllowedError"; });
    await rec(page).click(); await page.waitForTimeout(800);
    t.ok("explains the refusal", /permission was refused/i.test(await text(page)), (await text(page)).slice(0, 200));
    t.ok("the typing box is still there", (await typed(page).count()) === 1);
    await page.evaluate(() => { window.__deny = "NotFoundError"; });
    await rec(page).click(); await page.waitForTimeout(800);
    t.ok("no microphone at all is explained", /no microphone/i.test(await text(page)));
    await page.evaluate(() => { window.__deny = null; });
    await rec(page).click(); await page.waitForFunction(() => /Tap to finish/.test(document.querySelector("main button")?.textContent || ""), null, { timeout: 8000 });
    t.ok("and recovers once allowed", true);
    await close();
  });

  await test("leaving the screen mid-recording releases the microphone", async (t) => {
    const { page, go, close } = await open(engine, profile, { init: WRAP, seed: "full" });
    await go("/app");
    await rec(page).click(); await page.waitForFunction(() => /Tap to finish/.test(document.querySelector("main button")?.textContent || ""), null, { timeout: 8000 });
    t.ok("recording", (await live(page)) >= 1);
    await nav(page, "Journal").click(); await page.waitForTimeout(900);
    t.eq("the mic is off after moving to the Journal", await live(page), 0);
    await nav(page, "Capture").click(); await page.waitForTimeout(700);
    t.eq("and Capture is idle, not still recording", await label(page), "Say what you spent");
    await rec(page).click(); await page.waitForFunction(() => /Tap to finish/.test(document.querySelector("main button")?.textContent || ""), null, { timeout: 8000 });
    await page.goto(page.url().replace(/\/app.*/, "/you"), { waitUntil: "load" }); await page.waitForTimeout(600);
    t.eq("a full page change also ends it", await live(page), 0);
    await close();
  });

  await test("double-tapping the record button asks for the microphone once", async (t) => {
    const { page, go, close } = await open(engine, profile, { init: WRAP });
    await go("/app");
    await rec(page).dblclick({ delay: 30 }).catch(() => {});
    await page.waitForTimeout(2500);
    const gum = await page.evaluate(() => window.__gum);
    t.ok("one request, not two", gum === 1, "requests=" + gum);
    t.ok("at most one live stream", (await live(page)) <= 1, "live=" + (await live(page)));
    await close();
  });

  await test("the shortcut link starts recording with no tap, once", async (t) => {
    const { page, go, close } = await open(engine, profile, { init: WRAP });
    await go("/app?record=1");
    await page.waitForFunction(() => /Tap to finish/.test(document.querySelector("main button")?.textContent || ""), null, { timeout: 8000 });
    t.eq("recording by itself", await label(page), "Tap to finish");
    t.eq("the address is cleaned", new URL(page.url()).search, "");
    t.eq("exactly one request", await page.evaluate(() => window.__gum), 1);
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(1500);
    t.eq("a reload does not record again", await label(page), "Say what you spent");
    await close();
  });

  await test("'Start listening when I open the app' records on a launch, and only then", async (t) => {
    let c = await open(engine, profile, { init: WRAP, seedOpts: { settings: { openToRecord: true } } });
    await c.go("/app");
    await c.page.waitForFunction(() => /Tap to finish/.test(document.querySelector("main button")?.textContent || ""), null, { timeout: 8000 });
    t.eq("opening the app records", await label(c.page), "Tap to finish");
    await nav(c.page, "Journal").click(); await c.page.waitForTimeout(700);
    await nav(c.page, "Capture").click(); await c.page.waitForTimeout(1200);
    t.eq("coming back to Capture does not record again", await label(c.page), "Say what you spent");
    t.eq("and only one request was ever made", await c.page.evaluate(() => window.__gum), 1);
    await c.close();

    c = await open(engine, profile, { init: WRAP, seedOpts: { settings: { openToRecord: false } } });
    await c.go("/app"); await c.page.waitForTimeout(1500);
    t.eq("with the setting off, nothing starts", await label(c.page), "Say what you spent");
    t.eq("and the microphone was not touched", await c.page.evaluate(() => window.__gum), 0);
    await c.close();
  });

  await test("recording does not leak: ten start/stop cycles leave nothing live", async (t) => {
    const { page, go, close } = await open(engine, profile, { init: WRAP });
    await go("/app");
    for (let i = 0; i < 10; i++) {
      await rec(page).click();
      await page.waitForFunction(() => /Tap to finish/.test(document.querySelector("main button")?.textContent || ""), null, { timeout: 8000 });
      await page.waitForTimeout(250);
      await rec(page).click();
      await page.waitForFunction(() => /Say what you spent/.test(document.querySelector("main button")?.textContent || ""), null, { timeout: 10000 });
    }
    t.eq("no live tracks left", await live(page), 0);
    t.eq("ten entries made", (await store(page)).length, 10);
    await close();
  }, { timeout: 120000 });

  const bad = summary();
  await closeAll();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("SUITE CRASHED", e); process.exit(2); });

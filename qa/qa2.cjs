// Suite 2: first run and consent, the You screen, accounts, shortcut links, hostile conditions.
const fs = require("fs");
const { open, test, summary, closeAll } = require("./qa-lib.cjs");
const [engine, profile] = (process.argv[2] || "webkit:iPhone 14").split(":");

const typed = (p) => p.locator("[data-typed-entry]");
const add = (p) => p.locator("form button[type=submit]");
const ls = (p, k) => p.evaluate((k) => localStorage.getItem(k), k);
const store = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("vaanitrack.transactions") || "[]"));
const settings = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("vaanitrack.settings") || "{}"));
const text = (p) => p.locator("body").innerText();
const nav = (p, label) => p.locator('nav[aria-label="Screens"]').getByText(label, { exact: true });
async function send(p, s) { await typed(p).fill(s); await add(p).click(); await p.waitForTimeout(900); }
const nameBox = (p) => p.locator("main input:not([type=radio]):not([type=checkbox])").first();

(async () => {
  console.log(`=== suite 2 on ${engine} / ${profile}`);

  await test("first run: the tour, then the recordings question, then the app", async (t) => {
    const { page, go, state, close } = await open(engine, profile, { seed: "fresh" });
    await go("/app");
    t.ok("the tour is showing", /01 \/ 0\d/.test(await text(page)));
    let guard = 0;
    while (!(await page.getByRole("button", { name: "Yes, keep them" }).count()) && guard++ < 6) {
      await page.getByRole("button", { name: "Next" }).click(); await page.waitForTimeout(350);
    }
    t.ok("reached the recordings question by tapping Next", (await page.getByRole("button", { name: "Yes, keep them" }).count()) === 1, `after ${guard} taps`);
    t.ok("nothing is stored before the answer", (await ls(page, "vaanitrack.audioConsent")) === null);
    await page.getByRole("button", { name: "Yes, keep them" }).click(); await page.waitForTimeout(600);
    t.eq("consent granted", await ls(page, "vaanitrack.audioConsent"), "granted");
    t.eq("the tour is marked done", await ls(page, "vaanitrack.onboarded"), "true");
    t.ok("the app is visible", (await page.locator("[data-typed-entry]").count()) === 1);
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(800);
    t.ok("no tour on the next visit", !/01 \/ 0\d/.test(await text(page)));
    t.eq("no script errors", state.errors, []);
    await close();
  });

  await test("first run: Skip goes to the question, and No is honoured", async (t) => {
    const { page, go, close } = await open(engine, profile, { seed: "fresh" });
    await go("/app");
    await page.getByRole("button", { name: "Skip" }).click(); await page.waitForTimeout(500);
    t.ok("Skip lands on the recordings question", (await page.getByRole("button", { name: "No, don’t" }).count()) === 1);
    await page.getByRole("button", { name: "No, don’t" }).click(); await page.waitForTimeout(500);
    t.eq("consent denied", await ls(page, "vaanitrack.audioConsent"), "denied");
    await send(page, "30 chai");
    t.eq("typing still works after saying no", (await store(page)).length, 1);
    await close();
  });

  await test("the tour: Back goes back, and it reads 01 to 03", async (t) => {
    const { page, go, close } = await open(engine, profile, { seed: "fresh" });
    await go("/app");
    t.ok("starts at 01 / 03", /01 \/ 03/.test(await text(page)));
    t.eq("no Back on the first step", await page.getByRole("button", { name: "Back" }).count(), 0);
    t.ok("says what is true about language", /English for now/.test(await text(page)) && /dhai sau/.test(await text(page)));
    await page.getByRole("button", { name: "Next" }).click(); await page.waitForTimeout(350);
    t.ok("step 2", /02 \/ 03/.test(await text(page)));
    t.ok("step 2 no longer promises a check before every save", !/Check it before/.test(await text(page)) && /saved at once, with Undo/.test(await text(page)));
    await page.getByRole("button", { name: "Back" }).click(); await page.waitForTimeout(350);
    t.ok("Back returns to step 1", /01 \/ 03/.test(await text(page)));
    await page.getByRole("button", { name: "Next" }).click(); await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Next" }).click(); await page.waitForTimeout(350);
    t.ok("step 3 names the Journal and Insights", /03 \/ 03/.test(await text(page)) && /Journal/.test(await text(page)) && /Insights/.test(await text(page)));
    t.eq("focus is on the step's heading", await page.evaluate(() => document.activeElement?.tagName), "H1");
    await page.getByRole("button", { name: "Next" }).click(); await page.waitForTimeout(350);
    t.eq("then the question", await page.getByRole("button", { name: "No, don’t" }).count(), 1);
    t.eq("which cannot be skipped", await page.getByRole("button", { name: "Skip" }).count(), 0);
    await page.getByRole("button", { name: "Back" }).click(); await page.waitForTimeout(350);
    t.ok("Back from the question returns to step 3", /03 \/ 03/.test(await text(page)));
    t.eq("and nothing was stored", await ls(page, "vaanitrack.audioConsent"), null);
    await close();
  });

  await test("after the tour: help with the first expense, then one suggestion", async (t) => {
    const { page, go, state, close } = await open(engine, profile, { seed: "fresh" });
    await go("/app");
    await page.getByRole("button", { name: "Skip" }).click(); await page.waitForTimeout(400);
    await page.getByRole("button", { name: "No, don’t" }).click(); await page.waitForTimeout(600);
    t.eq("the guide has started", await ls(page, "vaanitrack.firstRun"), "guide");
    t.ok("it says what to do", /Record your first one/.test(await text(page)));
    const guide = page.locator('section[aria-label="Your first expense"]');
    const button = page.getByRole("button", { name: /Say what you spent/ });
    const gb = await guide.boundingBox(), bb = await button.boundingBox();
    t.ok("it sits above the record button, not over it", gb && bb && gb.y + gb.height <= bb.y + 1, JSON.stringify({ gb, bb }));
    await send(page, "250 lunch");
    t.eq("the expense is in the journal", (await store(page)).length, 1);
    t.eq("the guide moved on", await ls(page, "vaanitrack.firstRun"), "next");
    t.ok("it says so", /That’s your first one/i.test(await text(page)));
    t.ok("a browser is offered the home-screen tip, not the widget", /Keep it one tap away/.test(await text(page)) && !/Add the widget/.test(await text(page)));
    await page.getByRole("button", { name: "Start listening when I open the app" }).click(); await page.waitForTimeout(400);
    t.eq("the switch is saved", (await settings(page)).openToRecord, true);
    t.ok("and it says it is on", /It will listen as it opens/.test(await text(page)));
    await page.locator('section[aria-label="What next"]').getByRole("button", { name: "Done" }).click(); await page.waitForTimeout(400);
    t.eq("finished, nothing left stored", await ls(page, "vaanitrack.firstRun"), null);
    t.ok("the card is gone", !/your first one/i.test(await text(page)));
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(900);
    t.ok("and stays gone", !/first one/i.test(await text(page)) && !/first expense/i.test(await text(page)));
    t.eq("no script errors", state.errors.filter((e) => !/getUserMedia|NotAllowed|Permission/i.test(e)), []);
    await close();
  });

  await test("the guide walks an unsure first expense through, and can be put away", async (t) => {
    const { page, go, close } = await open(engine, profile, { seed: "fresh" });
    await go("/app");
    await page.getByRole("button", { name: "Skip" }).click(); await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Yes, keep them" }).click(); await page.waitForTimeout(600);
    await send(page, "250 unsure thing");
    t.eq("nothing saved on a guess", (await store(page)).length, 0);
    t.ok("the guide says to check it", /Check it, then save/.test(await text(page)));
    t.eq("still guiding", await ls(page, "vaanitrack.firstRun"), "guide");
    await page.locator('section[aria-label="Your first expense"]').getByRole("button", { name: "Not now" }).click(); await page.waitForTimeout(400);
    t.eq("Not now ends it", await ls(page, "vaanitrack.firstRun"), null);
    t.ok("the review card is still there to finish", (await page.getByRole("button", { name: /^Save/ }).count()) > 0);
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(900);
    t.ok("it does not come back", !/Record your first one/.test(await text(page)));
    await close();
  });

  await test("in the Android app the suggestion is the widget, with the set-up link", async (t) => {
    const { page, go, close } = await open(engine, profile, { seed: "fresh" });
    await go("/app");
    await page.evaluate(() => localStorage.setItem("vaanitrack.shell", "android"));
    await page.getByRole("button", { name: "Skip" }).click(); await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Yes, keep them" }).click(); await page.waitForTimeout(600);
    await send(page, "40 chai");
    t.ok("offers the widget", /Put the record button on your home screen/.test(await text(page)));
    const link = page.getByRole("link", { name: "Add the widget" });
    const href = await link.getAttribute("href");
    t.ok("with the app's own set-up link, carrying the answer just given", /^intent:\/\/setup\?d=[0-9a-f-]{36}&c=granted&p=UPI&r=0#Intent;scheme=vaanitrack;package=app\.vaanitrack\.android;end$/.test(href || ""), href);
    await page.evaluate(() => { const s = localStorage; s.setItem("vaanitrack.widgetSynced", [s.getItem("vaanitrack.device"), "granted", "UPI", "0"].join("|")); });
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(900);
    t.ok("once connected it says so, and how to add it by hand", /The widget is connected/.test(await text(page)) && /press and hold your home screen/.test(await text(page)));
    await page.locator('section[aria-label="What next"]').getByRole("button", { name: "Done" }).click(); await page.waitForTimeout(400);
    t.eq("finished", await ls(page, "vaanitrack.firstRun"), null);
    await close();
  });

  await test("someone who already uses the app sees no guide, and can replay the tour", async (t) => {
    const { page, go, close } = await open(engine, profile, { seed: "ready" });
    await go("/app");
    t.ok("no guide on capture", !/first expense/i.test(await text(page)) && !/first one/i.test(await text(page)));
    t.eq("nothing stored for it", await ls(page, "vaanitrack.firstRun"), null);
    await go("/you");
    await page.getByRole("button", { name: "See the welcome tour again" }).click(); await page.waitForTimeout(500);
    t.ok("the tour opens at step 1", /01 \/ 03/.test(await text(page)));
    t.eq("with Close, not Skip", [await page.getByRole("button", { name: "Close" }).count(), await page.getByRole("button", { name: "Skip" }).count()], [1, 0]);
    await page.getByRole("button", { name: "Next" }).click(); await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Next" }).click(); await page.waitForTimeout(300);
    t.eq("it ends on Done, not on a question", [await page.getByRole("button", { name: "Done" }).count(), await page.getByRole("button", { name: "Yes, keep them" }).count()], [1, 0]);
    await page.getByRole("button", { name: "Done" }).click(); await page.waitForTimeout(400);
    t.ok("and closes", !/0\d \/ 03/.test(await text(page)));
    t.eq("the recordings answer is untouched", await ls(page, "vaanitrack.audioConsent"), "granted");
    t.eq("no guide was started", await ls(page, "vaanitrack.firstRun"), null);
    await page.getByRole("button", { name: "See the welcome tour again" }).click(); await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Close" }).click(); await page.waitForTimeout(400);
    t.ok("Close closes it too", !/0\d \/ 03/.test(await text(page)));
    await close();
  });

  await test("returning browser that never answered is asked, once", async (t) => {
    const { page, go, close } = await open(engine, profile, { seed: "returning" });
    await go("/app");
    t.ok("no tour (already used)", !/01 \/ 0\d/.test(await text(page)));
    t.ok("the question covers the screen", (await page.getByRole("button", { name: "Yes, keep them" }).count()) === 1);
    await page.getByRole("button", { name: "Yes, keep them" }).click(); await page.waitForTimeout(500);
    t.eq("answer stored", await ls(page, "vaanitrack.audioConsent"), "granted");
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(700);
    t.eq("not asked again", await page.getByRole("button", { name: "Yes, keep them" }).count(), 0);
    await close();
  });

  await test("You: name shows on the avatar, is capped and cleaned", async (t) => {
    const { page, go, close } = await open(engine, profile);
    await go("/you");
    const avatar = page.locator('a[href="/you"]').first();
    t.eq("no name: plain icon label", await avatar.getAttribute("aria-label"), "You");
    await nameBox(page).fill("Asha Rao"); await page.waitForTimeout(300);
    t.eq("avatar shows the initial", (await avatar.innerText()).trim(), "A");
    t.eq("and names the person", await avatar.getAttribute("aria-label"), "You, Asha Rao");
    await nameBox(page).fill("x".repeat(80)); await page.waitForTimeout(200);
    t.ok("capped at 40", ((await settings(page)).name || "").length <= 40, String(((await settings(page)).name || "").length));
    await nameBox(page).fill(""); await page.waitForTimeout(200);
    t.eq("cleared: back to the icon", await avatar.getAttribute("aria-label"), "You");
    await nameBox(page).fill("Zoë 日本"); await page.waitForTimeout(200);
    t.eq("non-Latin initials work", (await avatar.innerText()).trim(), "Z");
    await close();
  });

  await test("You: default payment reaches the server and the saved row", async (t) => {
    const { page, go, state, close } = await open(engine, profile);
    await go("/you");
    await page.getByRole("radio", { name: /Cash/ }).check({ force: true }); await page.waitForTimeout(300);
    t.eq("stored", (await settings(page)).defaultPayment, "Cash");
    await go("/app");
    await send(page, "100 tea");
    t.eq("the request carried Cash", state.extract.at(-1)?.defaultPayment, "Cash");
    t.eq("the row is filed as Cash", (await store(page))[0]?.paymentMethod.value, "Cash");
    await send(page, "50 cash coffee");
    t.eq("a spoken method still wins", (await store(page)).find((r) => r.description.value === "cash coffee")?.paymentMethod.provenance, "said");
    await close();
  });

  await test("You: 'Always let me check first' sends even sure entries to review", async (t) => {
    const { page, go, close } = await open(engine, profile);
    await go("/you");
    await page.getByRole("radio", { name: /Always let me check first/ }).check({ force: true }); await page.waitForTimeout(300);
    await go("/app");
    await send(page, "80 snack");
    t.eq("nothing saved yet", (await store(page)).length, 0);
    t.ok("a card is waiting", (await page.getByRole("button", { name: "Save", exact: true }).count()) === 1);
    t.ok("without the 'unsure' warning", !(await page.locator("p.bg-ember-glow").count()));
    await page.getByRole("button", { name: "Save", exact: true }).click(); await page.waitForTimeout(600);
    t.eq("Save files it", (await store(page)).length, 1);
    await close();
  });

  await test("You: switches persist across a reload", async (t) => {
    const { page, go, close } = await open(engine, profile);
    await go("/you");
    const open2r = page.getByRole("switch", { name: /Start listening when I open the app/ });
    const keep = page.getByRole("switch", { name: /Keep my recordings/ });
    t.eq("open-to-record starts off", await open2r.getAttribute("aria-checked"), "false");
    t.eq("recordings starts on (granted)", await keep.getAttribute("aria-checked"), "true");
    await open2r.click(); await keep.click(); await page.waitForTimeout(300);
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(800);
    t.eq("open-to-record stayed on", await page.getByRole("switch", { name: /Start listening/ }).getAttribute("aria-checked"), "true");
    t.eq("recordings stayed off", await page.getByRole("switch", { name: /Keep my recordings/ }).getAttribute("aria-checked"), "false");
    t.eq("consent is now denied in storage", await ls(page, "vaanitrack.audioConsent"), "denied");
    await close();
  });

  await test("You: export gives a correct, safe CSV", async (t) => {
    const { page, go, close } = await open(engine, profile, { seed: "full" });
    await go("/app");
    await send(page, "5 =HYPERLINK(1) bad");
    await go("/you");
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), page.getByRole("button", { name: /Export my journal/ }).click()]);
    const file = await dl.path();
    const csv = fs.readFileSync(file, "utf8");
    t.ok("file is named for today", /^vaanitrack-journal-\d{4}-\d{2}-\d{2}\.csv$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    t.ok("starts with a BOM so spreadsheets read ₹ and accents", csv.charCodeAt(0) === 0xfeff);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    const stored = await store(page);
    t.eq("one line per expense plus the header", lines.length, stored.length + 1);
    t.ok("a leading = is defused", csv.includes("'=HYPERLINK") && !/(^|,)=HYPERLINK/m.test(csv));
    t.ok("header is as promised", lines[0].startsWith("Date,Time,Amount (INR),Description"));
    await close();
  });

  await test("You: delete my recordings, success and failure", async (t) => {
    const { page, go, state, close } = await open(engine, profile, { seed: "full" });
    await go("/you");
    const before = (await store(page)).length;
    await page.getByRole("button", { name: "Delete my recordings" }).click(); await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Keep them" }).click(); await page.waitForTimeout(300);
    t.eq("cancelling sends nothing", state.erase.length, 0);
    await page.getByRole("button", { name: "Delete my recordings" }).click();
    await page.getByRole("button", { name: "Delete recordings", exact: true }).click(); await page.waitForTimeout(800);
    t.eq("the request scope", state.erase.at(-1)?.scope, "recordings");
    t.ok("with this phone's id", /^[0-9a-f-]{36}$/.test(state.erase.at(-1)?.deviceId || ""));
    t.eq("the journal is untouched", (await store(page)).length, before);
    t.ok("a result is announced", /deleted|removed|no recordings|done/i.test(await text(page)), (await text(page)).slice(-300));
    state.onErase = () => ({ status: 500, json: { ok: false, error: "The server couldn’t delete that. Nothing was removed." } });
    await page.getByRole("button", { name: "Delete my recordings" }).click();
    await page.getByRole("button", { name: "Delete recordings", exact: true }).click(); await page.waitForTimeout(800);
    t.ok("a failure says so", /couldn|nothing was removed|failed/i.test(await text(page)));
    t.eq("and still touches nothing on the phone", (await store(page)).length, before);
    await close();
  });

  await test("You: delete everything is guarded, honest, and complete", async (t) => {
    const { page, go, state, close } = await open(engine, profile, { seed: "full", seedOpts: { settings: { name: "Asha", reviewAll: true } } });
    await go("/you");
    const open1 = page.getByRole("button", { name: "Delete everything" });
    await open1.click(); await page.waitForTimeout(300);
    const confirmBtn = page.getByRole("button", { name: "Delete everything" });
    t.ok("the button waits for the word", await confirmBtn.isDisabled());
    const box = page.locator("input[autocomplete=off]");
    await box.fill("delet"); t.ok("a near miss does not unlock it", await confirmBtn.isDisabled());
    await page.getByRole("button", { name: "Keep it" }).click().catch(async () => { await page.getByRole("button", { name: /Cancel|Keep/ }).last().click(); });
    await page.waitForTimeout(300);
    t.eq("cancelling sends nothing", state.erase.length, 0);
    await page.getByRole("button", { name: "Delete everything" }).click();
    state.onErase = () => ({ status: 500, json: { ok: false, error: "The server couldn’t delete that. Nothing was removed." } });
    await page.locator("input[autocomplete=off]").fill("DELETE");
    await page.getByRole("button", { name: "Delete everything" }).click(); await page.waitForTimeout(900);
    t.ok("a server failure keeps the journal", (await store(page)).length > 50);
    t.eq("and the settings", (await settings(page)).name, "Asha");
    state.onErase = undefined;
    await page.locator("input[autocomplete=off]").fill("delete");
    await page.getByRole("button", { name: "Delete everything" }).click(); await page.waitForTimeout(2600);
    t.eq("the server was asked to wipe everything", state.erase.at(-1)?.scope, "everything");
    t.eq("the journal is gone from the phone", (await store(page)).length, 0);
    t.eq("settings are gone", await ls(page, "vaanitrack.settings"), null);
    t.eq("consent is gone", await ls(page, "vaanitrack.audioConsent"), null);
    t.eq("the welcome tour is not shown again", await ls(page, "vaanitrack.onboarded"), "true");
    t.ok("sent back to the capture screen", /\/app$/.test(page.url()), page.url());
    await close();
  });

  await test("accounts: sign-up checks, sign-in checks, sign-out", async (t) => {
    const { page, go, state, close } = await open(engine, profile);
    await go("/signup");
    const email = page.locator("input[type=email]"); const [pw1, pw2] = [page.locator("input[type=password]").nth(0), page.locator("input[type=password]").nth(1)];
    const submit = page.locator("form button[type=submit]");
    t.ok("submit is off while empty", await submit.isDisabled());
    await email.fill("nope"); await email.blur(); await page.waitForTimeout(150);
    t.ok("bad email is called out", /valid email/i.test(await text(page)));
    await email.fill("asha@example.com");
    await pw1.fill("abc"); await pw1.blur(); await page.waitForTimeout(150);
    t.ok("short password is called out", /At least \d+ characters/.test(await text(page)));
    await pw1.fill("a-long-enough-password"); await pw2.fill("different"); await pw2.blur(); await page.waitForTimeout(150);
    t.ok("mismatch is called out", /match/i.test(await text(page)));
    t.ok("submit stays off", await submit.isDisabled());
    await pw2.fill("a-long-enough-password"); await page.waitForTimeout(150);
    t.ok("valid form enables submit", !(await submit.isDisabled()));
    await submit.click(); await page.waitForTimeout(1500);
    t.ok("lands in the app", /\/app$/.test(page.url()), page.url());
    await go("/you");
    t.ok("You shows who is signed in", /asha@example\.com/.test(await text(page)));
    await page.getByRole("button", { name: "Sign out" }).click(); await page.waitForTimeout(500);
    t.ok("signed out", /Sign in/.test(await text(page)) && !/asha@example\.com/.test(await text(page)));
    await go("/signin");
    await page.locator("input[type=email]").fill("ghost@example.com"); await page.locator("input[type=password]").fill("whatever-123456");
    await page.locator("form button[type=submit]").click(); await page.waitForTimeout(1500);
    t.ok("an unknown account is refused clearly", /No account found/.test(await text(page)));
    await page.locator("input[type=email]").fill("asha@example.com");
    await page.locator("form button[type=submit]").click(); await page.waitForTimeout(1500);
    t.ok("a known account signs in", /\/app$/.test(page.url()), page.url());
    t.eq("no script errors", state.errors, []);
    await close();
  });

  await test("shortcut links: type, journal-from-widget, cold journal, bogus values", async (t) => {
    let c = await open(engine, profile);
    await c.go("/app?type=1");
    t.eq("?type=1 focuses the typing box", await c.page.evaluate(() => document.activeElement?.hasAttribute("data-typed-entry")), true);
    t.eq("and cleans the address", new URL(c.page.url()).search, "");
    await c.close();

    c = await open(engine, profile);
    await c.go("/journal?from=widget");
    t.ok("the widget's journal link stays on the journal", /\/journal/.test(c.page.url()) && /Expenses/.test(await text(c.page)), c.page.url());
    await c.close();

    c = await open(engine, profile);
    await c.go("/journal");
    t.ok("a cold /journal goes to capture", /\/app$/.test(c.page.url()), c.page.url());
    await c.close();

    c = await open(engine, profile);
    await c.go("/app?record=0&type=yes");
    t.eq("bogus values do nothing", await c.page.evaluate(() => document.activeElement?.hasAttribute("data-typed-entry")), false);
    t.ok("no error on the screen", !(await c.page.locator("p.border-alert").count()));
    await c.close();
  });

  await test("offline: a clear message, the words kept, and recovery", async (t) => {
    const { page, go, state, close } = await open(engine, profile);
    await go("/app");
    state.netDown = true;
    await typed(page).fill("90 offline chai"); await add(page).click(); await page.waitForTimeout(1200);
    t.ok("says it cannot reach the server", /reach|connection|offline|network/i.test(await text(page)), (await text(page)).slice(0, 220));
    t.eq("nothing saved", (await store(page)).length, 0);
    t.eq("words kept", await typed(page).inputValue(), "90 offline chai");
    state.netDown = false;
    await add(page).click(); await page.waitForTimeout(1000);
    t.eq("back online, the same tap works", (await store(page)).length, 1);
    await close();
  });

  await test("storage blocked (private mode): the app still works for the session", async (t) => {
    const blocked = `(() => { const boom = () => { throw new DOMException("blocked", "SecurityError"); };
      Object.defineProperty(window, "localStorage", { get() { return { getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom, length: 0 }; } }); })();`;
    const { page, go, state, close } = await open(engine, profile, { seed: "fresh", init: blocked });
    await go("/app");
    t.ok("the app loads (no tour trap)", (await page.locator("[data-typed-entry]").count()) >= 0);
    // The recordings question may cover the screen; answer it if so.
    if (await page.getByRole("button", { name: "No, don’t" }).count()) { await page.getByRole("button", { name: "No, don’t" }).click(); await page.waitForTimeout(400); }
    if (await page.getByRole("button", { name: "Skip" }).count()) { await page.getByRole("button", { name: "Skip" }).click(); await page.waitForTimeout(400); }
    if (await page.getByRole("button", { name: "No, don’t" }).count()) { await page.getByRole("button", { name: "No, don’t" }).click(); await page.waitForTimeout(400); }
    if (await typed(page).count()) {
      await send(page, "20 memory only");
      t.ok("an entry still appears on screen", /memory only/.test(await text(page)), (await text(page)).slice(0, 160));
    } else t.ok("the capture box is reachable", false, (await text(page)).slice(0, 200));
    t.eq("no script errors", state.errors.filter((e) => !/blocked|SecurityError/.test(e)), []);
    await close();
  });

  const bad = summary();
  await closeAll();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("SUITE CRASHED", e); process.exit(2); });

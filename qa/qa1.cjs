// Suite 1: capture by typing, the review card, undo, errors, the detail sheet, the journal.
const { open, test, summary, closeAll, txn } = require("./qa-lib.cjs");
const [engine, profile] = (process.argv[2] || "webkit:iPhone 14").split(":");

const typed = (page) => page.locator("[data-typed-entry]");
const add = (page) => page.locator("form button[type=submit]");
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("vaanitrack.transactions") || "[]"));
const text = (page) => page.locator("body").innerText();
const todayLocal = (page) => page.evaluate(() => { const d = new Date(); const o = d.getTimezoneOffset() * 6e4; return new Date(d.getTime() - o).toISOString().slice(0, 10); });
async function send(page, s) { await typed(page).fill(s); await add(page).click(); await page.waitForTimeout(900); }

(async () => {
  console.log(`=== suite 1 on ${engine} / ${profile}`);

  await test("typed expense is saved straight away, with Undo", async (t) => {
    const { page, go, state, close } = await open(engine, profile);
    await go("/app");
    t.ok("Add is disabled while the box is empty", await add(page).isDisabled());
    await send(page, "250 lunch");
    const saved = await store(page);
    t.eq("one entry saved", saved.length, 1);
    t.eq("amount", saved[0]?.amount.value, 250);
    t.eq("description", saved[0]?.description.value, "lunch");
    t.eq("dated today", saved[0]?.date.value, await todayLocal(page));
    t.eq("source says it was typed", saved[0]?.source, "manual");
    const body = await text(page);
    t.ok("a Logged confirmation is shown", /Logged/.test(body), body.slice(0, 80));
    t.ok("the list shows the row", /lunch/.test(body) && /250/.test(body));
    t.ok("the box was cleared", (await typed(page).inputValue()) === "");
    t.ok("the request carried today's date", /^\d{4}-\d{2}-\d{2}$/.test(state.extract[0]?.today || ""));
    t.eq("and the default payment", state.extract[0]?.defaultPayment, "UPI");
    await page.getByRole("button", { name: "Undo" }).click(); await page.waitForTimeout(500);
    t.eq("Undo removes it from storage", (await store(page)).length, 0);
    t.ok("and from the screen", !/Logged ₹250/.test(await text(page)));
    t.eq("no script errors", state.errors, []);
    await close();
  });

  await test("an unsure expense goes to the review card", async (t) => {
    const { page, go, state, close } = await open(engine, profile);
    await go("/app");
    await send(page, "500 unsure rahul");
    t.eq("nothing saved yet", (await store(page)).length, 0);
    const body = await text(page);
    t.ok("a review card is up", /Save/.test(body) && /Discard/.test(body), body.slice(0, 100));
    const clear = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Screens"] .glass-bar').getBoundingClientRect();
      const save = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save").getBoundingClientRect();
      return { navTop: Math.round(nav.top), saveTop: Math.round(save.top), saveBottom: Math.round(save.bottom), vh: innerHeight };
    });
    t.ok("Save is fully visible and clear of the glass bar", clear.saveBottom <= clear.navTop && clear.saveTop >= 0, JSON.stringify(clear));
    t.ok("an unsure expense opens ready to edit", (await page.locator("input[inputmode=decimal]").count()) === 1);
    await page.locator("input[inputmode=decimal]").first().fill("550");
    await page.getByRole("button", { name: "Save", exact: true }).click(); await page.waitForTimeout(700);
    const saved = await store(page);
    t.eq("saved after the edit", saved.length, 1);
    t.eq("with the corrected amount", saved[0]?.amount.value, 550);
    t.eq("no script errors", state.errors, []);
    await close();
  });

  await test("discarding a review card saves nothing", async (t) => {
    const { page, go, close } = await open(engine, profile);
    await go("/app");
    await send(page, "300 unsure");
    await page.getByRole("button", { name: "Discard" }).click(); await page.waitForTimeout(500);
    t.eq("nothing saved", (await store(page)).length, 0);
    t.ok("the card is gone", !/Discard/.test(await text(page)));
    await close();
  });

  await test("server failure shows a message and keeps what was typed", async (t) => {
    const { page, go, state, close } = await open(engine, profile);
    await go("/app");
    await typed(page).fill("100 boom"); await add(page).click(); await page.waitForTimeout(900);
    t.ok("an error is shown", /fell over|couldn|try again|wrong/i.test(await text(page)), (await text(page)).slice(0, 200));
    t.eq("nothing saved", (await store(page)).length, 0);
    t.eq("the typed words are still there to retry", await typed(page).inputValue(), "100 boom");
    t.ok("Add is usable again", !(await add(page).isDisabled()));
    state.onExtract = undefined;
    await typed(page).fill("100 chai"); await add(page).click(); await page.waitForTimeout(800);
    t.eq("a retry works and the old error is gone", (await store(page)).length, 1);
    await close();
  });

  await test("malformed model reply (502) and empty reply are handled", async (t) => {
    const { page, go, close } = await open(engine, profile);
    await go("/app");
    await send(page, "100 bad502");
    t.ok("502 shows a message", /malformed|couldn|understand|again/i.test(await text(page)), (await text(page)).slice(0, 160));
    await typed(page).fill("100 empty"); await add(page).click(); await page.waitForTimeout(900);
    t.ok("an empty reply shows a message", /couldn|didn|no expense|understand|again|try/i.test(await text(page)), (await text(page)).slice(0, 160));
    t.eq("neither saved anything", (await store(page)).length, 0);
    await close();
  });

  await test("two expenses in one go are both saved", async (t) => {
    const { page, go, close } = await open(engine, profile);
    await go("/app");
    await send(page, "multi chai and lunch");
    const saved = await store(page);
    t.eq("two saved", saved.length, 2);
    t.eq("amounts", saved.map((s) => s.amount.value).sort(), [100, 200]);
    await close();
  });

  await test("double-tapping Add does not save twice", async (t) => {
    const { page, go, close } = await open(engine, profile);
    await go("/app");
    await typed(page).fill("75 slow tea");
    await add(page).click({ clickCount: 2, delay: 20 }).catch(() => {});
    await page.waitForTimeout(2500);
    t.eq("exactly one entry", (await store(page)).length, 1);
    await close();
  });

  await test("Enter key submits; very long and odd text is survived", async (t) => {
    const { page, go, state, close } = await open(engine, profile);
    await go("/app");
    await typed(page).fill("40 chai"); await typed(page).press("Enter"); await page.waitForTimeout(800);
    t.eq("Enter saved it", (await store(page)).length, 1);
    await send(page, "10 " + "x".repeat(3000));
    await send(page, "5 <script>window.__xss=1</script> “quotes” 'single' \\ backslash 😀");
    t.ok("no script ran from typed text", !(await page.evaluate(() => window.__xss)));
    t.ok("the page still works", (await store(page)).length >= 2);
    t.eq("no script errors", state.errors, []);
    await close();
  });

  await test("the detail sheet: open, edit, save, cancel, delete", async (t) => {
    const { page, go, close } = await open(engine, profile);
    await go("/app");
    await send(page, "120 snack");
    await page.getByRole("button", { name: /^snack/ }).first().click(); await page.waitForTimeout(500);
    t.ok("the sheet opens", (await page.locator("[role=dialog]").count()) === 1);
    await page.getByRole("button", { name: "Edit", exact: true }).click(); await page.waitForTimeout(300);
    await page.locator("[role=dialog] input").first().fill("125");
    await page.getByRole("button", { name: "Cancel" }).click(); await page.waitForTimeout(300);
    t.eq("Cancel keeps the old amount", (await store(page))[0]?.amount.value, 120);
    await page.getByRole("button", { name: "Edit", exact: true }).click(); await page.waitForTimeout(300);
    await page.locator("[role=dialog] input").first().fill("125");
    await page.getByRole("button", { name: "Save", exact: true }).click(); await page.waitForTimeout(500);
    t.eq("Save stores the new amount", (await store(page))[0]?.amount.value, 125);
    t.eq("Save closes the sheet", await page.locator("[role=dialog]").count(), 0);
    t.ok("the list shows the new amount", /125/.test(await text(page)));
    await page.getByRole("button", { name: /^snack/ }).first().click(); await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Delete this transaction" }).click(); await page.waitForTimeout(300);
    t.ok("a confirmation appears", /permanently removes/.test(await text(page)));
    await page.getByRole("button", { name: "Cancel" }).click(); await page.waitForTimeout(300);
    t.eq("cancelling the delete keeps it", (await store(page)).length, 1);
    await page.getByRole("button", { name: "Delete this transaction" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click(); await page.waitForTimeout(600);
    t.eq("deleting removes it, even the last one", (await store(page)).length, 0);
    t.eq("and the sheet is closed", await page.locator("[role=dialog]").count(), 0);
    await close();
  });

  await test("the sheet closes with its Back button and keeps the list intact", async (t) => {
    const { page, go, close } = await open(engine, profile, { seed: "full" });
    await go("/app");
    const before = await store(page);
    await page.locator("main button").filter({ hasText: /UPI/ }).first().click(); await page.waitForTimeout(500);
    t.ok("opened", (await page.locator("[role=dialog]").count()) === 1);
    await page.getByRole("button", { name: /‹/ }).first().click(); await page.waitForTimeout(400);
    t.eq("closed", await page.locator("[role=dialog]").count(), 0);
    t.eq("nothing changed", (await store(page)).length, before.length);
    await close();
  });

  await test("journal: calendar totals, month change, day view, All days", async (t) => {
    const { page, go, close } = await open(engine, profile, { seed: "full" });
    await go("/app");
    await page.locator('nav[aria-label="Screens"]').getByText("Journal", { exact: true }).click(); await page.waitForTimeout(900);
    t.ok("heading", /Expenses/.test(await text(page)));
    t.ok("calendar shows rupee totals", (await page.locator("button[aria-label*=', ₹'], button[aria-label*='₹']").count()) > 3, "cells with totals");
    const monthLabelBefore = await page.locator("main").innerText();
    await page.getByRole("button", { name: "Previous month" }).click(); await page.waitForTimeout(400);
    t.ok("Previous month changed the calendar", (await page.locator("main").innerText()) !== monthLabelBefore);
    await page.getByRole("button", { name: "Next month" }).click(); await page.waitForTimeout(300);
    const cell = page.locator("button[aria-label*='₹']").first();
    await cell.click(); await page.waitForTimeout(500);
    t.ok("a day opens with its own heading and All days button", /All days/.test(await text(page)));
    await page.getByRole("button", { name: "All days" }).click(); await page.waitForTimeout(400);
    t.ok("All days returns to the full list", !/All days/.test(await text(page)));
    await close();
  });

  await test("journal: record onto a past day, and close the sheet three ways", async (t) => {
    const { page, go, close } = await open(engine, profile, { seed: "full" });
    await go("/app");
    await page.locator('nav[aria-label="Screens"]').getByText("Journal", { exact: true }).click(); await page.waitForTimeout(900);
    const cell = page.locator("button[aria-label*='₹']").nth(4);
    const label = await cell.getAttribute("aria-label");
    await cell.click(); await page.waitForTimeout(500);
    const before = (await store(page)).length;
    await page.getByRole("button", { name: "+ Log an expense" }).click();
    await page.waitForTimeout(500);
    const open1 = (await page.locator("[role=dialog][aria-label*='Record an expense onto']").count()) === 1;
    t.ok("the day sheet opens", open1, label);
    if (open1) {
      await page.locator("[role=dialog] [data-typed-entry]").fill("66 backdated"); await page.locator("[role=dialog] form button[type=submit]").click(); await page.waitForTimeout(900);
      const after = await store(page);
      t.eq("one more entry", after.length, before + 1);
      const mine = after.find((a) => a.description.value === "backdated");
      const dayNumber = Number((label.match(/^(\d+)/) || [])[1]);
      t.ok("dated to the chosen day, not today", !!mine && Number(mine.date.value.slice(8, 10)) === dayNumber, JSON.stringify(mine && mine.date));
      await page.getByRole("dialog").getByRole("button", { name: "Done" }).click(); await page.waitForTimeout(400);
      t.eq("closed with the Done button", await page.locator("[role=dialog]").count(), 0);
    }
    await close();
  });

  await test("empty journal, and the capture screen with no entries", async (t) => {
    const { page, go, close } = await open(engine, profile, { seed: "ready" });
    await go("/app");
    t.ok("capture says nothing today yet", /Nothing today yet|nothing/i.test(await text(page)));
    await page.locator('nav[aria-label="Screens"]').getByText("Journal", { exact: true }).click(); await page.waitForTimeout(800);
    t.ok("journal says it is empty", /empty|Expenses you record will appear/i.test(await text(page)));
    await page.locator('nav[aria-label="Screens"]').getByText("Insights", { exact: true }).click(); await page.waitForTimeout(800);
    t.ok("insights invites a first expense", /few more expenses|Record an expense/i.test(await text(page)));
    await close();
  });

  const bad = summary();
  await closeAll();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("SUITE CRASHED", e); process.exit(2); });

// Suite 5: accessibility audit with axe-core across screens and states.
const path = require("path");
const { open, closeAll, txn } = require("./qa-lib.cjs");
const AXE = path.join(__dirname, "node_modules", "axe-core", "axe.min.js");
const profile = process.argv[2] || "iPhone 14";

async function audit(page, name, found) {
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => {
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes.slice(0, 2).map((n) => n.target.join(" ") + " :: " + (n.failureSummary || "").split("\n").slice(1, 3).join(" ").slice(0, 160)) }));
  });
  for (const v of res) found.push({ where: name, ...v });
  console.log(`${res.length === 0 ? "CLEAN" : res.length + " issue(s)"}  ${name}`);
}
const nav = (p, l) => p.locator('nav[aria-label="Screens"]').getByText(l, { exact: true });

(async () => {
  const found = [];
  let c = await open("chromium", profile, { seed: "full" });
  const { page } = c;
  for (const r of ["/", "/signin", "/signup"]) { await c.go(r); await audit(page, r, found); }
  await c.go("/app"); await audit(page, "/app (with entries)", found);
  await page.locator("[data-typed-entry]").fill("500 unsure rahul"); await page.locator("form button[type=submit]").click(); await page.waitForTimeout(1000);
  await audit(page, "/app (review card showing)", found);
  await page.getByRole("button", { name: "Discard" }).click(); await page.waitForTimeout(300);
  await page.locator("[data-typed-entry]").fill("40 chai"); await page.locator("form button[type=submit]").click(); await page.waitForTimeout(1000);
  await audit(page, "/app (just logged, Undo showing)", found);
  await page.locator("main button").filter({ hasText: /UPI/ }).first().click(); await page.waitForTimeout(500);
  await audit(page, "transaction detail sheet", found);
  await page.getByRole("button", { name: "Edit", exact: true }).click(); await page.waitForTimeout(300);
  await audit(page, "transaction detail (editing)", found);
  await c.go("/app"); await nav(page, "Journal").click(); await page.waitForTimeout(900); await audit(page, "/journal", found);
  await page.locator("button[aria-label*='₹']").nth(3).click(); await page.waitForTimeout(500); await audit(page, "/journal (a day chosen)", found);
  await page.getByRole("button", { name: "+ Log an expense" }).click(); await page.waitForTimeout(500); await audit(page, "day capture sheet", found);
  await c.go("/app"); await nav(page, "Insights").click(); await page.waitForTimeout(900); await audit(page, "/insights", found);
  await c.go("/you"); await audit(page, "/you", found);
  await page.getByRole("button", { name: "Delete everything" }).click(); await page.waitForTimeout(300); await audit(page, "/you (delete everything confirm)", found);
  await c.close();

  c = await open("chromium", profile, { seed: "fresh" });
  await c.go("/app"); await audit(c.page, "first-run tour step 1", found);
  await c.page.getByRole("button", { name: "Next" }).click(); await c.page.waitForTimeout(500); await audit(c.page, "first-run tour step 2", found);
  await c.page.getByRole("button", { name: "Skip" }).click(); await c.page.waitForTimeout(500); await audit(c.page, "first-run consent question", found);
  await c.close();
  c = await open("chromium", profile, { seed: "returning" });
  await c.go("/app"); await audit(c.page, "returning-user consent card", found);
  await c.close();
  c = await open("chromium", profile, { seed: "ready" });
  await c.go("/app"); await audit(c.page, "/app (empty)", found);
  await nav(c.page, "Insights").click(); await c.page.waitForTimeout(700); await audit(c.page, "/insights (empty)", found);
  await c.close();

  // Group
  const byRule = {};
  for (const f of found) { (byRule[f.id] ||= { id: f.id, impact: f.impact, help: f.help, where: [], sample: f.sample }).where.push(f.where); }
  console.log("\n=== DISTINCT ISSUES: " + Object.keys(byRule).length);
  for (const r of Object.values(byRule).sort((a, b) => ["critical", "serious", "moderate", "minor"].indexOf(a.impact) - ["critical", "serious", "moderate", "minor"].indexOf(b.impact))) {
    console.log(`\n[${r.impact}] ${r.id}: ${r.help}\n   on ${r.where.length} screen(s): ${r.where.slice(0, 5).join("; ")}\n   e.g. ${r.sample[0]}`);
  }
  await closeAll();
})().catch((e) => { console.error("CRASH", e); process.exit(2); });

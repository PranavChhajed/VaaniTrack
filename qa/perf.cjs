const { open, closeAll } = require("./qa-lib.cjs");
const engine = process.argv[2] || "chromium";
(async () => {
  for (const n of [300, 1000, 3000]) {
    const big = `(() => { if (localStorage.getItem("qa.big")) return; localStorage.setItem("qa.big","1"); const f=(v,p="said")=>({value:v,provenance:p}); const out=[]; const now=new Date();
      for (let i=0;i<${n};i++){ const d=new Date(now); d.setDate(d.getDate()-Math.floor(i/3)); const o=d.getTimezoneOffset()*6e4; const iso=new Date(d.getTime()-o).toISOString().slice(0,10);
        out.push({id:"b"+i,amount:f(10+(i%90)),description:f(["chai","lunch","dosa","auto","parking"][i%5]),category:f(null,"unknown"),payee:f(null,"unknown"),paymentMethod:f("UPI","default"),date:f(iso,"default"),time:f(null,"unknown"),createdAt:d.toISOString(),source:"voice"}); }
      localStorage.setItem("vaanitrack.transactions", JSON.stringify(out)); })()`;
    const { page, go, close } = await open(engine, "iPhone 14", { seed: "ready", init: big });
    await go("/app");
    const res = {};
    for (const [label, tab, wait] of [["journal", "Journal", "h1:has-text('Expenses')"], ["insights", "Insights", "text=Last 7 days"], ["capture", "Capture", "[data-typed-entry]"]]) {
      const t0 = Date.now();
      await page.locator('nav[aria-label="Screens"]').getByText(tab, { exact: true }).click();
      await page.waitForSelector(wait, { timeout: 60000 });
      await page.waitForTimeout(50);
      res[label] = Date.now() - t0;
    }
    const rows = await page.evaluate(() => 0);
    console.log(engine, n, "entries:", JSON.stringify(res));
    await close();
  }
  await closeAll();
})();

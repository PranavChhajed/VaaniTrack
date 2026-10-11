// The voice lab, driven with Chrome's fake microphone: logs in, records a take, checks both variants reached storage, then deletes them. Needs `npx next dev -p 3100` and .env.local. Writes to the real lab/ folder under the session "qa-test" and removes it.
const { chromium } = require("playwright");
const fs = require("fs");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
(async () => {
  const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const ctx = await b.newContext({ permissions: ["microphone"], viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3100/lab");
  await p.waitForSelector('input[type=password]', { timeout: 20000 });
  await p.fill('input[type=password]', env.PORTAL_PASSWORD);
  await p.keyboard.press("Enter");
  await p.getByText("Voice lab").waitFor({ timeout: 20000 });
  await p.locator('input').last().fill("qa-test");
  console.log("line:", (await p.locator("section").innerText()).replace(/\s+/g, " ").slice(0, 80));
  await p.getByRole("button", { name: /Tap, then say the line/ }).click();
  await p.getByRole("button", { name: /Speak now/ }).waitFor({ timeout: 8000 });
  await p.waitForTimeout(1500);
  await p.getByRole("button", { name: /Speak now/ }).click();
  await p.getByText(/Saved/).waitFor({ timeout: 20000 });
  console.log("status:", await p.getByRole("status").innerText());
  const res = await p.evaluate(() => fetch("/api/lab").then((r) => r.json()));
  console.log("stored:", res.takes.filter((t) => t.startsWith("qa-test/")));
  // clean up the test files
  for (const t of res.takes.filter((t) => t.startsWith("qa-test/"))) {
    const d = await p.evaluate((path) => fetch("/api/lab", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }).then((r) => r.status), t);
    console.log("deleted", t, d);
  }
  await b.close();
})().catch((e) => { console.error("FAILED", e.message.split("\n")[0]); process.exit(1); });

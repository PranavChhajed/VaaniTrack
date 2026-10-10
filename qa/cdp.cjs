// Reads the real state of the app running inside the Android emulator, over
// Chrome's remote-debugging link (adb forward tcp:9222 localabstract:chrome_devtools_remote).
const { chromium } = require("playwright");
(async () => {
  const wait = Number(process.argv[2] || 0);
  if (wait) await new Promise((r) => setTimeout(r, wait));
  const browser = await chromium.connectOverCDP("http://localhost:9222", { timeout: 15000 });
  const out = [];
  for (const ctx of browser.contexts()) {
    for (const page of ctx.pages()) {
      let probe = null;
      try {
        probe = await page.evaluate(() => ({
          url: location.pathname + location.search,
          h1: (document.querySelector("h1")?.textContent || "").slice(0, 40),
          recorderButton: (document.querySelector("main button")?.textContent || "").trim().slice(0, 30),
          focused: document.activeElement ? (document.activeElement.tagName + (document.activeElement.hasAttribute("data-typed-entry") ? "[typed-entry]" : "")) : null,
          notice: [...document.querySelectorAll("[role=status]")].map((e) => e.textContent.slice(0, 60)),
          alerts: [...document.querySelectorAll("p")].filter((p) => p.className.includes("border-alert")).map((p) => p.textContent.slice(0, 90)),
          tabCurrent: document.querySelector('nav[aria-label="Screens"] a[aria-current="page"]')?.textContent || null,
          visible: document.visibilityState,
          onboarding: document.body.innerText.includes("01 / 0"),
          entries: (() => { try { return JSON.parse(localStorage.getItem("vaanitrack.transactions") || "[]").length; } catch { return -1; } })(),
          width: innerWidth,
        }));
      } catch (e) { probe = { error: String(e).slice(0, 100) }; }
      out.push({ title: await page.title().catch(() => ""), ...probe });
    }
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error("CDP FAILED", String(e).slice(0, 300)); process.exit(1); });

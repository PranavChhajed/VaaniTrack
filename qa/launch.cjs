// "Start listening when I open the app": launch versus tapping around, in WebKit.
// This WebKit has no microphone API, so an attempt shows as the engine's own
// "will not give the page a microphone" message; no message means no attempt.
const { webkit, devices } = require("playwright");
const WAIT = (process.env.BASE || "http://localhost").includes("localhost") ? "networkidle" : "load";
const BASE = process.env.BASE || "http://localhost:3200";

const setup = (openToRecord) => () => {
  localStorage.setItem("vaanitrack.device", "11111111-1111-4111-8111-111111111111");
  localStorage.setItem("vaanitrack.onboarded", "true");
  localStorage.setItem("vaanitrack.audioConsent", "granted");
  if (window.__OPEN !== undefined || true) {
    if (!localStorage.getItem("vaanitrack.settings")) {
      localStorage.setItem("vaanitrack.settings", JSON.stringify({ openToRecord: OPEN }));
    }
  }
};

async function attempted(page) {
  await page.waitForTimeout(1800);
  return page.evaluate(() => [...document.querySelectorAll("p")].some((p) => /will not give the page a microphone|Tap the button to start/.test(p.textContent || "")));
}

async function scenario(name, open, steps) {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  await ctx.addInitScript(`const OPEN=${open}; (${setup(open).toString()})()`);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const got = await steps(page);
  await browser.close();
  return { name, ...got, pageErrors: errs.length };
}

const tab = (page, label) => page.locator('nav[aria-label="Screens"]').getByText(label, { exact: true }).tap();

(async () => {
  const rows = [];
  rows.push(await scenario("setting OFF, app opened", false, async (p) => {
    await p.goto(BASE + "/app", { waitUntil: WAIT });
    return { attempt: await attempted(p), want: false };
  }));
  rows.push(await scenario("setting ON, app opened", true, async (p) => {
    await p.goto(BASE + "/app", { waitUntil: WAIT });
    return { attempt: await attempted(p), want: true };
  }));
  rows.push(await scenario("setting ON, opened on You then tapped Capture", true, async (p) => {
    await p.goto(BASE + "/you", { waitUntil: WAIT });
    await p.waitForTimeout(800);
    await tab(p, "Capture");
    return { attempt: await attempted(p), want: false };
  }));
  rows.push(await scenario("setting ON, app opened, left for Journal and came back", true, async (p) => {
    await p.goto(BASE + "/app", { waitUntil: WAIT });
    await attempted(p);
    await tab(p, "Journal");
    await p.waitForTimeout(700);
    await tab(p, "Capture");
    return { attempt: await attempted(p), want: false };
  }));
  rows.push(await scenario("setting ON, app opened, then reloaded", true, async (p) => {
    await p.goto(BASE + "/app", { waitUntil: WAIT });
    await attempted(p);
    await p.reload({ waitUntil: WAIT });
    return { attempt: await attempted(p), want: false };
  }));
  rows.push(await scenario("setting ON, journal opened cold (redirects to capture)", true, async (p) => {
    await p.goto(BASE + "/journal", { waitUntil: WAIT });
    return { attempt: await attempted(p), want: true, note: "cold /journal is sent to /app, which is a launch of capture" };
  }));
  rows.push(await scenario("setting OFF, shortcut link", false, async (p) => {
    await p.goto(BASE + "/app?record=1", { waitUntil: WAIT });
    return { attempt: await attempted(p), want: true };
  }));
  rows.push(await scenario("setting ON, flip the switch on the You screen", false, async (p) => {
    await p.goto(BASE + "/you", { waitUntil: WAIT });
    await p.waitForTimeout(900);
    const sw = p.getByRole("switch", { name: /Start listening when I open the app/ });
    const before = await sw.getAttribute("aria-checked");
    await sw.tap();
    await p.waitForTimeout(300);
    const after = await sw.getAttribute("aria-checked");
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem("vaanitrack.settings") || "{}").openToRecord);
    await p.reload({ waitUntil: WAIT });
    await p.waitForTimeout(700);
    const afterReload = await p.getByRole("switch", { name: /Start listening when I open the app/ }).getAttribute("aria-checked");
    return { attempt: before === "false" && after === "true" && stored === true && afterReload === "true", want: true, note: `before=${before} after=${after} stored=${stored} reloaded=${afterReload}` };
  }));

  let bad = 0;
  for (const r of rows) {
    const pass = r.attempt === r.want && r.pageErrors === 0;
    if (!pass) bad++;
    console.log(`${pass ? "PASS" : "FAIL"}  ${r.name}  (attempted=${r.attempt}, expected=${r.want}${r.note ? ", " + r.note : ""}${r.pageErrors ? ", pageErrors=" + r.pageErrors : ""})`);
  }
  console.log(bad ? `\n${bad} FAILED` : "\nall passed");
})().catch((e) => { console.error("FAILED", String(e).slice(0, 400)); process.exit(1); });

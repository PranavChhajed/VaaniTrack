// The home-screen widget, end to end, on an emulator.
//
// What it needs running:
//   - the emulator, with the TEST build installed
//       gradlew assembleRelease -PvaaniApi=http://10.0.2.2:4010 -PvaaniUrl=<preview>
//   - the stand-in server:   node qa/widget-mock.cjs
//   - the widget placed on the home screen at its default 2x2 spot, centred on x=540,y=780
//     (tap positions below are for a 1080x2400 screen)
//
//   ADB=/path/to/adb node qa/qa-widget.cjs
//
// The tile cannot be read by UI tools (it is animated, so the phone is never "idle"),
// so every redraw logs one line (`VaaniWidget`) and the checks read those.
const { execSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ADB = process.env.ADB || "adb";
const PKG = "app.vaanitrack.android";
const MOCK = process.env.MOCK || "http://localhost:4010";
const DEVICE = "11111111-1111-4111-8111-111111111111";
const OUT = __dirname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (c, opts = {}) => execSync(`${ADB} ${c}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
// One quoted argument for adb.exe (through cmd.exe), single quotes inside for the phone's own shell.
const shell = (c) => sh(`shell "${c}"`);
const shot = (name) => fs.writeFileSync(path.join(OUT, `widget-${name}.png`), execSync(`${ADB} exec-out screencap -p`, { maxBuffer: 1 << 26 }));

const TILE = [540, 780];
const UNDO = [678, 606];
const tap = ([x, y]) => shell(`input tap ${x} ${y}`);
/** Open a link on the phone. (The whole command is one quoted argument; the link is single-quoted inside it, so & survives.) */
const link = (u) => shell(`am start -a android.intent.action.VIEW -d '${u}'`);
const home = () => shell("input keyevent KEYCODE_HOME");

const get = (p) => new Promise((res, rej) => http.get(MOCK + p, (r) => { let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => res(b)); }).on("error", rej));
const mode = (m) => get(`/__mode?m=${m}`);
const mockLog = async () => JSON.parse(await get("/__log"));

/* ---- reading the tile ---- */
const LINE = /ready=(\w+) state=(\w+) title=(.*?) sub=(.*?) amount=(.*?) waiting=(\d+) undo=(\w+)\s*$/;
function tiles() {
  const raw = sh("logcat -d -s VaaniWidget", { maxBuffer: 1 << 24 });
  return raw.split("\n").map((l) => LINE.exec(l)).filter(Boolean).map((m) => ({
    ready: m[1] === "true", state: m[2], title: m[3], sub: m[4], amount: m[5], waiting: Number(m[6]), undo: m[7] === "true",
  }));
}
const last = () => tiles().at(-1) || null;
const clearLog = () => { try { sh("logcat -c"); } catch {} };
async function until(pred, ms = 15000, what = "the tile") {
  const t0 = Date.now();
  for (;;) {
    const all = tiles();
    const hit = all.find(pred);
    if (hit) return hit;
    if (Date.now() - t0 > ms) throw new Error(`${what} never got there (last: ${JSON.stringify(all.at(-1))})`);
    await sleep(250);
  }
}
const states = () => { const out = []; for (const t of tiles()) if (out.at(-1) !== t.state) out.push(t.state); return out; };
const errors = () => sh("logcat -d -s AndroidRuntime:E", { maxBuffer: 1 << 24 }).split("\n").filter((l) => l.includes(PKG) || l.includes("FATAL")).join("\n");

/* ---- the harness ---- */
const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !process.env.ONLY.split(",").some((o) => name.includes(o))) return;
  const checks = []; let crashed = null;
  const t = {
    ok: (w, p, x = "") => checks.push({ w, p: !!p, x: String(x).slice(0, 220) }),
    eq: (w, g, e) => checks.push({ w, p: JSON.stringify(g) === JSON.stringify(e), x: `got ${JSON.stringify(g)} want ${JSON.stringify(e)}` }),
  };
  try { await fn(t); } catch (e) { crashed = String(e.message || e).split("\n")[0].slice(0, 260); }
  const bad = checks.filter((c) => !c.p); const pass = !crashed && !bad.length;
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  (${checks.length} checks)`);
  for (const c of bad) console.log(`        ✗ ${c.w}${c.x ? "  → " + c.x : ""}`);
  if (crashed) console.log(`        ✗ crashed: ${crashed}`);
}

/** Back to a clean idle tile with a fresh log and a fresh server log. */
async function fresh(m = "sure") {
  await mode(m); await get("/__reset");
  home();
  // Whatever the last test left on the tile has to run out (or be undone).
  const t0 = Date.now();
  for (;;) {
    const l = last();
    if (!l || l.state === "IDLE") break;
    if (Date.now() - t0 > 20000) throw new Error("the tile never went back to idle: " + JSON.stringify(l));
    await sleep(500);
  }
  clearLog();
  await sleep(300);
}
/** Tap the tile, wait for it to say the mic is live, tap again to finish. */
async function speak(then = "TAP") {
  tap(TILE);
  await until((t) => t.state === "RECORDING", 8000, "listening");
  await sleep(700);
  if (then === "TAP") tap(TILE);
}
/** Finish whatever take is running: wait until it is really listening, tap, wait for an outcome. */
async function finishRunning() {
  await until((t) => t.state === "RECORDING", 8000, "listening (to finish it)");
  await sleep(500);
  tap(TILE);
  await until((t) => ["SAVED", "CHECK", "FAILED"].includes(t.state), 20000, "an outcome");
}
/** Finish whatever take is running: wait until it is really listening, tap, wait for an outcome. */
async function finishRunning() {
  await until((t) => t.state === "RECORDING", 8000, "listening (to finish it)");
  await sleep(500);
  tap(TILE);
  await until((t) => ["SAVED", "CHECK", "FAILED"].includes(t.state), 20000, "an outcome");
}
async function connect() {
  link(`vaanitrack://setup?d=${DEVICE}&c=granted&p=UPI&r=0`);
}

(async () => {
  shell("settings put global animator_duration_scale 1");
  shell("settings put system font_scale 1.0");
  // A clean slate: no queue, no set-up, no permissions. The tile stays where it was placed.
  shell(`pm clear ${PKG}`);
  shell(`pm grant ${PKG} android.permission.RECORD_AUDIO`);
  shell(`pm grant ${PKG} android.permission.POST_NOTIFICATIONS`);
  await connect(); await sleep(2500); home(); await sleep(1500);

  await test("a logged expense: every state, in the order the web button uses", async (t) => {
    await fresh("sure");
    await speak();
    await until((x) => x.state === "SAVED", 15000, "saved");
    const s = states();
    t.eq("states in order (no mic-ready lie, no skipped step)", s, ["WARMING", "RECORDING", "READING", "SAVED"]);
    const saved = last();
    t.eq("amount", saved.amount, "₹250");
    t.eq("what", saved.title, "Lunch");
    t.eq("says Logged", saved.sub, "Logged ✓");
    t.ok("offers Undo", saved.undo);
    const warm = tiles().find((x) => x.state === "WARMING");
    t.eq("while warming it does not invite the tap", warm.title, "Getting the mic ready…");
    t.eq("while listening it says Tap to finish", tiles().find((x) => x.state === "RECORDING").title, "Tap to finish");
    t.ok("what was heard shows while it is read", tiles().some((x) => x.state === "READING" && x.sub.includes("250 lunch")), JSON.stringify(tiles().filter((x) => x.state === "READING")));
    const sent = (await mockLog()).at(-1);
    t.eq("sent the phone's id", sent.deviceId, DEVICE);
    t.eq("sent the recordings answer", sent.audioConsent, "granted");
    t.eq("sent the default payment", sent.defaultPayment, "UPI");
    t.eq("sent today's date (the speaker's, not the server's)", sent.today, new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10));
    t.ok("sent real audio, more than the server's 2,000-byte floor", sent.bodyBytes > 6000, `body ${sent.bodyBytes}B`);
    t.eq("as mp4 audio", sent.audioType, "audio/mp4");
    t.ok("sent how long it listened", Number(sent.audioMs) > 700, sent.audioMs);
    t.ok("sent the warm-up time", Number(sent.warmupMs) >= 0, sent.warmupMs);
    shot("saved");
    t.eq("no crash", errors(), "");
  });

  await test("after a few seconds the tile goes back to idle, and counts what is waiting", async (t) => {
    await sleep(14000);
    const l = last();
    t.eq("idle again", l.state, "IDLE");
    t.ok("says how many are waiting for the app", /waiting for the app/.test(l.sub), l.sub);
  });

  await test("Undo takes the expense back out of the queue", async (t) => {
    await fresh("sure");
    await speak();
    const saved = await until((x) => x.state === "SAVED", 15000);
    const before = tiles().find((x) => x.state === "WARMING").waiting;
    t.eq("one more waiting", saved.waiting, before + 1);
    tap(UNDO);
    const idle = await until((x) => x.state === "IDLE", 6000, "idle after undo");
    t.eq("back to what was waiting before", idle.waiting, before);
    t.eq("no undo button left", idle.undo, false);
  });

  await test("two expenses in one breath are both logged, and say so", async (t) => {
    await fresh("two");
    await speak();
    const s = await until((x) => x.state === "SAVED", 15000);
    t.eq("first amount shown", s.amount, "₹250");
    t.eq("the rest counted", s.sub, "Logged ✓ · +1 more");
    t.eq("two more waiting", s.waiting - (tiles().find((x) => x.state === "WARMING")?.waiting ?? 0), 2);
  });

  await test("an unsure result is shown, not saved: Check this", async (t) => {
    await fresh("unsure");
    await speak();
    const s = await until((x) => x.state === "CHECK", 15000);
    t.eq("headline", s.title, "Check this");
    t.eq("amount shown with a question, not a Logged", s.amount, "₹250");
    t.ok("never says Logged", !/Logged/.test(s.sub), s.sub);
    t.eq("no Undo to offer (nothing was saved)", s.undo, false);
    t.eq("tells the person to tap", s.sub, "Tap to check it");
    shot("check");
  });

  await test("a shaky transcript is held for review even with a clear amount", async (t) => {
    await fresh("shaky");
    await speak();
    const s = await until((x) => x.state === "CHECK", 15000);
    t.eq("held", s.state, "CHECK");
  });

  await test("review-everything setting holds even a sure result", async (t) => {
    link(`vaanitrack://setup?d=${DEVICE}&c=granted&p=UPI&r=1`); await sleep(2000); home();
    await fresh("sure");
    await speak();
    const s = await until((x) => x.state === "CHECK" || x.state === "SAVED", 15000);
    t.eq("held", s.state, "CHECK");
    link(`vaanitrack://setup?d=${DEVICE}&c=granted&p=UPI&r=0`); await sleep(2000); home();
  });

  await test("nothing to log: says so, plainly, and a tap tries again", async (t) => {
    await fresh("noamount");
    await speak();
    const s = await until((x) => x.state === "FAILED", 15000);
    t.eq("headline", s.title, "Tap to try again");
    t.ok("says what it heard and what was missing", /No amount in “lunch”/.test(s.sub), s.sub);
    // The tap starts a new take.
    await mode("sure");
    clearLog();
    tap(TILE);
    await until((x) => x.state === "WARMING", 6000, "a new take starting from the failure");
    t.ok("a failure does not stick", true);
    await finishRunning(); // so the next test starts clean
  });

  await test("the transcriber hearing nothing: the server's own words", async (t) => {
    await fresh("silent");
    await speak();
    const s = await until((x) => x.state === "FAILED", 15000);
    t.ok("uses the server's message", /Didn’t catch any speech/.test(s.sub), s.sub);
  });

  await test("the server errors: a message, never a hang", async (t) => {
    await fresh("error");
    await speak();
    const s = await until((x) => x.state === "FAILED", 15000);
    t.ok("says it was busy", /busy/.test(s.sub), s.sub);
  });

  await test("the server answers with something that is not JSON", async (t) => {
    await fresh("html");
    await speak();
    const s = await until((x) => x.state === "FAILED", 15000);
    t.ok("readable message", s.sub.length > 5, s.sub);
    t.eq("no crash", errors(), "");
  });

  await test("the connection drops mid-reply", async (t) => {
    await fresh("drop");
    await speak();
    const s = await until((x) => x.state === "FAILED", 20000);
    t.ok("tells the person about the connection", /connection|reach|unreadable|nothing/i.test(s.sub), s.sub);
  });

  await test("tapping while it is reading changes nothing", async (t) => {
    await fresh("slow");
    await speak();
    await until((x) => x.state === "READING", 8000);
    tap(TILE); await sleep(300); tap(TILE);
    const s = await until((x) => x.state === "SAVED", 20000);
    t.eq("exactly one capture was sent", (await mockLog()).length, 1);
    t.eq("and it was logged once", s.waiting - (tiles().find((x) => x.state === "WARMING")?.waiting ?? 0), 1);
  });

  await test("tapping while the mic is warming up is ignored", async (t) => {
    await fresh("sure");
    tap(TILE); await sleep(250); tap(TILE);
    await until((x) => x.state === "RECORDING", 8000, "listening anyway");
    t.ok("still listening, not stopped by the early tap", !tiles().some((x) => x.state === "READING"));
    await sleep(500); tap(TILE);
    await until((x) => x.state === "SAVED", 15000);
  });

  await test("a double tap from idle starts one take, not two", async (t) => {
    await fresh("sure");
    tap(TILE); tap(TILE);
    await until((x) => x.state === "RECORDING", 8000);
    await sleep(600); tap(TILE);
    await until((x) => x.state === "SAVED", 15000);
    t.eq("one capture", (await mockLog()).length, 1);
    t.eq("no crash", errors(), "");
  });

  await test("a take left running is finished for the person at 45 seconds", async (t) => {
    await fresh("sure");
    tap(TILE);
    await until((x) => x.state === "RECORDING", 8000);
    await until((x) => x.state === "READING" || x.state === "SAVED", 60000, "the automatic finish");
    t.ok("it finished on its own and sent the take", true);
    await until((x) => x.state === "SAVED", 20000);
  });

  await test("the app being killed mid-take does not leave the tile saying it is listening", async (t) => {
    await fresh("sure");
    tap(TILE);
    await until((x) => x.state === "RECORDING", 8000);
    shell(`am crash ${PKG}`);
    // The alarm set when the take began redraws it, but waiting that long in a test is slow:
    // the next tap is the other way it heals. The log is cleared so only what follows counts.
    await sleep(2500);
    await mode("sure");
    clearLog();
    tap(TILE);
    const s = await until((x) => x.state === "WARMING" || x.state === "RECORDING", 10000, "a fresh take after the crash");
    t.ok("a tap starts a new take rather than being stuck", !!s);
    await finishRunning();
    t.eq("and it logged", last().state, "SAVED");
  });

  await test("with notifications refused, listening still works", async (t) => {
    shell(`pm revoke ${PKG} android.permission.POST_NOTIFICATIONS`);
    await sleep(1500); home();
    await fresh("sure");
    await speak();
    await until((x) => x.state === "SAVED", 15000);
    t.ok("logged without a notification", true);
    shell(`pm grant ${PKG} android.permission.POST_NOTIFICATIONS`);
  });

  await test("animations off: the listening picture stops moving", async (t) => {
    await fresh("sure");
    shell("settings put global animator_duration_scale 0");
    tap(TILE);
    await until((x) => x.state === "RECORDING", 8000);
    await sleep(800);
    // Only the picture on the tile, so the clock and status icons cannot count as movement.
    const frames = new Set();
    for (let i = 0; i < 6; i++) {
      const png = execSync(`${ADB} exec-out screencap -p`, { maxBuffer: 1 << 26 });
      const file = path.join(OUT, "widget-frame.png");
      fs.writeFileSync(file, png);
      const hash = execSync(`python -I -c "import hashlib,sys; from PIL import Image; im=Image.open(sys.argv[1]).convert('RGB').crop((340,570,740,880)); print(hashlib.md5(im.tobytes()).hexdigest())" "${file}"`, { encoding: "utf8" }).trim();
      frames.add(hash);
      await sleep(120);
    }
    shell("settings put global animator_duration_scale 1");
    t.eq("the picture does not move", frames.size, 1);
    tap(TILE);
    await until((x) => x.state === "SAVED", 15000);
  });

  await test("large system text: the tile still shows its words", async (t) => {
    shell("settings put system font_scale 1.5");
    await sleep(2500);
    await fresh("sure");
    shot("bigtext-idle");
    await speak();
    await until((x) => x.state === "SAVED", 15000);
    shot("bigtext-saved");
    t.eq("no crash", errors(), "");
    shell("settings put system font_scale 1.0");
  });

  await test("a revoked microphone sends the person to set it up, and says so", async (t) => {
    shell(`pm revoke ${PKG} android.permission.RECORD_AUDIO`);
    await sleep(2000); home();
    clearLog();
    tap(TILE);
    const s = await until((x) => !x.ready, 8000, "the not-ready tile");
    t.eq("headline", s.title, "Connect VaaniTrack");
    t.ok("tells them to allow the microphone", /microphone/i.test(s.sub), s.sub);
    shell(`pm grant ${PKG} android.permission.RECORD_AUDIO`);
    await sleep(1500);
  });

  await test("a bad set-up link is refused and changes nothing", async (t) => {
    clearLog();
    link(`vaanitrack://setup?d=not-a-uuid&c=granted&p=UPI&r=0`);
    await sleep(2000);
    t.eq("no crash", errors(), "");
    home();
    link(`vaanitrack://setup?d=${DEVICE}&c=unknown&p=UPI&r=0`);
    await sleep(1500);
    t.eq("no crash on an unanswered recordings question", errors(), "");
    home();
  });

  await test("updating the app keeps what is waiting", async (t) => {
    await connect(); await sleep(2500); home();
    await fresh("sure");
    await speak();
    const before = await until((x) => x.state === "SAVED", 15000);
    const apk = process.env.APK;
    if (!apk) { t.ok("skipped: set APK to the test build to run this", true); return; }
    sh(`install -r ${apk}`);
    await sleep(6000);
    const after = last();
    t.eq("still waiting", after.waiting, before.waiting);
  });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} tests passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("CRASHED", e); process.exit(2); });

const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const adb = process.env.ADB || 'D:/Personal/Pucho/.android-sdk/platform-tools/adb.exe';
const pkg = 'app.vaanitrack.android';
const tile = `${pkg}/.CaptureTileService`;
const run = (...args) => execFileSync(adb, ['-s', 'emulator-5554', ...args], { encoding: 'utf8', timeout: 20000 });
const shell = (...args) => run('shell', ...args);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = () => run('logcat', '-d', '-s', 'VaaniQuickCapture:D', '*:S');
async function until(test, label, ms = 12000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (test()) return; await sleep(300); }
  throw new Error(`Timed out: ${label}\n${log()}`);
}
async function open() {
  shell('cmd', 'statusbar', 'expand-settings'); await sleep(600);
  shell('cmd', 'statusbar', 'click-tile', tile);
  await sleep(1200);
}
async function xml() {
  shell('uiautomator', 'dump', '/sdcard/vaani-quick-qa.xml');
  return shell('cat', '/sdcard/vaani-quick-qa.xml');
}
let checks = 0;
const check = value => { assert.ok(value); checks++; };
async function main() {
  if (process.env.ISOLATED_APK !== '1') throw new Error('Install the APK pointing to local mock servers, then set ISOLATED_APK=1');
  // Emulator only. No host microphone or physical phone is used.
  run('emu', 'avd', 'hostmicon', 'off');
  shell('input', 'keyevent', 'KEYCODE_WAKEUP'); shell('wm', 'dismiss-keyguard');
  shell('pm', 'grant', pkg, 'android.permission.RECORD_AUDIO');
  shell('cmd', 'statusbar', 'add-tile', tile);
  shell('input', 'keyevent', 'KEYCODE_BACK');
  run('logcat', '-c');
  await open();
  await until(() => log().includes('RECORDING:true'), 'tile starts visible recorder'); checks++;
  const layout = await xml();
  check(layout.includes('STOP RECORDING') && layout.includes('CANCEL AND CLOSE'));
  check(!layout.includes('₹') && !layout.includes('250 lunch'));
  // Repeat the tile action while recording: it must not toggle Stop or create another take.
  await open();
  check(shell('dumpsys', 'activity', 'services', pkg).includes('RecordService'));
  // Wait for the shade's collapse before using the recorder's controls.
  check((await xml()).includes('CANCEL AND CLOSE'));
  shell('input', 'tap', '540', '725');
  await sleep(700);
  check(!shell('dumpsys', 'activity', 'services', pkg).includes('isForeground=true'));
  // Process death leaves no automatic microphone restart.
  run('logcat', '-c');
  await open(); await until(() => log().includes('RECORDING:true'), 'repeat capture');
  shell('am', 'force-stop', pkg); run('logcat', '-c'); await sleep(1500);
  check(!shell('dumpsys', 'activity', 'services', pkg).includes('isForeground=true'));
  await open(); await until(() => log().includes('RECORDING:true'), 'explicit capture after process death'); checks++;
  shell('input', 'keyevent', 'KEYCODE_BACK'); await sleep(700);
  // Permission revocation: open may ask permission, but cannot start a service.
  shell('pm', 'revoke', pkg, 'android.permission.RECORD_AUDIO'); run('logcat', '-c');
  await open(); await sleep(1200);
  check(!shell('dumpsys', 'activity', 'services', pkg).includes('isForeground=true'));
  shell('input', 'keyevent', 'KEYCODE_BACK'); await sleep(500);
  check(!log().includes('RECORDING:true'));
  shell('pm', 'grant', pkg, 'android.permission.RECORD_AUDIO');
  shell('input', 'keyevent', 'KEYCODE_BACK');
  console.log(`Quick capture: ${checks} emulator checks passed (Android 14; not Nothing OS)`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

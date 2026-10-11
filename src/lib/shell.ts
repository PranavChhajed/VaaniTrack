import { audioConsent, deviceId } from "./device";
import { readLocal, writeLocal } from "./localStore";
import { loadSettings } from "./settings";
import { useLocalValue } from "./useLocalValue";

/**
 * Whether this page is being shown by the Android app.
 *
 * The Android app is the website in a Trusted Web Activity, so the page itself
 * cannot tell, except at the moment it opens: the first load carries a
 * referrer of `android-app://<package>`. That is noted once, in storage, so
 * the You screen can offer the widget's set-up button to people who have the
 * app, and not to everyone else. (The storage is Chrome's, shared with the
 * website, so on a phone that uses both the button simply appears in both.)
 */

const PACKAGE = "app.vaanitrack.android";
const SHELL_KEY = "vaanitrack.shell";
const SYNCED_KEY = "vaanitrack.widgetSynced";

/** Call once when the app's screens mount. */
export function noteShell(referrer: string): void {
  if (referrer.startsWith(`android-app://${PACKAGE}`) && readLocal(SHELL_KEY) !== "android") {
    writeLocal(SHELL_KEY, "android");
  }
}

export function useAndroidShell(): boolean {
  return useLocalValue(() => readLocal(SHELL_KEY) === "android", false);
}

/** What the widget needs to know, as it stands now. */
export function widgetSettings() {
  const settings = loadSettings();
  return {
    device: deviceId(),
    consent: audioConsent(),
    payment: settings.defaultPayment,
    reviewAll: settings.reviewAll,
  };
}

/** The same four things as a single string, to tell whether the widget is behind. */
export function widgetFingerprint(): string {
  const s = widgetSettings();
  return [s.device ?? "", s.consent, s.payment, s.reviewAll ? "1" : "0"].join("|");
}

/**
 * The link that connects the widget: the app's own `vaanitrack://setup`, in
 * the `intent:` form Chrome opens straight into this package, with no chooser.
 * Null until there is a device id and the recordings question has an answer,
 * because the widget cannot be set up without either.
 */
export function widgetLink(): string | null {
  const s = widgetSettings();
  if (!s.device || (s.consent !== "granted" && s.consent !== "denied")) return null;
  const q = new URLSearchParams({
    d: s.device,
    c: s.consent,
    p: s.payment,
    r: s.reviewAll ? "1" : "0",
  });
  return `intent://setup?${q.toString()}#Intent;scheme=vaanitrack;package=${PACKAGE};end`;
}

/** Remember what the widget was last told. */
export function markWidgetSynced(): void {
  writeLocal(SYNCED_KEY, widgetFingerprint());
}

/** "never", "current", or "behind": for the words on the You screen. */
export function useWidgetSync(): "never" | "current" | "behind" {
  // Reading the settings in the snapshot makes this follow them: a change in
  // another tab, or on this screen, redraws it.
  return useLocalValue<"never" | "current" | "behind">(() => {
    const synced = readLocal(SYNCED_KEY);
    if (!synced) return "never";
    return synced === widgetFingerprint() ? "current" : "behind";
  }, "never");
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioConsent, useOnboarded } from "./device";
import { useSettings } from "./settings";
import type { RecorderState } from "./useRecorder";

/**
 * Whether a query string asks the capture screen to start listening.
 *
 * A home-screen shortcut, an Android long-press action and the native widget
 * all open `/app?record=1`; this is the one place that decides what that
 * means. Only an explicit yes counts, so a stray `?record=0` or `?recording`
 * never turns the microphone on.
 */
export function wantsRecord(search: string): boolean {
  const value = new URLSearchParams(search).get("record");
  return value === "1" || value === "true";
}

/**
 * Whether this page load was the app being *opened* on the capture screen,
 * as opposed to reloaded, reached with Back, or arrived at by tapping around.
 *
 * The browser's record of how the document was loaded is the only thing that
 * can tell these apart: client-side navigation never changes it, so a person
 * who opened You and then tapped the Capture tab still has "You" as the
 * document they opened, and is not a launch of capture.
 */
export function isLaunchOfCapture(entry: { type: string; name: string } | undefined): boolean {
  if (!entry || entry.type !== "navigate") return false;
  try {
    return new URL(entry.name).pathname === "/app";
  } catch {
    return false;
  }
}

/** Whether to listen now: asked to by the address, or by the person's own
 *  setting on a genuine launch. */
export function shouldAutoRecord(o: {
  search: string;
  openToRecord: boolean;
  launchOfCapture: boolean;
}): boolean {
  return wantsRecord(o.search) || (o.openToRecord && o.launchOfCapture);
}

/** Module state lasts exactly as long as the document does, which is the
 *  lifetime of one launch: a full load resets it, tapping around does not. */
let launchTaken = false;

/** The launch is spent the first time the capture screen asks about it, so
 *  leaving capture and coming back never counts as opening the app again. */
function takeLaunch(): boolean {
  if (launchTaken) return false;
  launchTaken = true;
  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return isLaunchOfCapture(entry);
}

/** The recorder's wording for a refusal. Only this one is softened below: a
 *  missing microphone or an insecure page is not something a tap fixes, and
 *  must say so straight away. */
const REFUSED = "Microphone permission was refused";

/**
 * Start recording as soon as the screen opens from a shortcut, or when the
 * person has asked for the app to open listening.
 *
 * It waits until the person can actually see and answer the screen: the
 * first-run tour is finished and the recordings question has been answered.
 * Starting underneath an overlay would put the microphone on with nobody able
 * to see it.
 *
 * The attempt is made once. The query is removed from the address first, so a
 * reload, or coming back to the tab, never turns the microphone on again.
 *
 * Browsers differ on whether a page may open the microphone without a tap.
 * Where it may not, the attempt fails and the screen says to tap the button;
 * that tap is an ordinary gesture and works. Nothing about the failure is
 * hidden except the wording, which would otherwise read as a permission
 * problem the person has not got.
 */
export function useAutoRecord({
  state,
  error,
  start,
}: {
  state: RecorderState;
  error: string | null;
  start: () => Promise<void>;
}) {
  const consent = useAudioConsent();
  const onboarded = useOnboarded();
  const { openToRecord } = useSettings();

  const triedRef = useRef(false);
  // Decided once, on the first look, and kept: the answer must not change
  // when the settings finish loading a moment later.
  const launchRef = useRef<boolean | null>(null);
  const [tried, setTried] = useState(false);
  const [tapped, setTapped] = useState(false);

  const ready =
    onboarded === true &&
    consent !== null &&
    consent !== "unknown" &&
    state === "idle";

  useEffect(() => {
    if (launchRef.current === null) launchRef.current = takeLaunch();
    if (!ready || triedRef.current) return;
    // Read here, not while rendering: the address is not state the screen
    // reacts to, it is a request that arrived with the page, and during an
    // in-app navigation it is only up to date once the page has committed.
    if (
      !shouldAutoRecord({
        search: window.location.search,
        openToRecord,
        launchOfCapture: launchRef.current,
      })
    ) {
      return;
    }
    triedRef.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    void start().then(() => setTried(true));
  }, [ready, start, openToRecord]);

  /** The button's own start. A tap ends the "tap to start" explanation. */
  const startByTap = useCallback(() => {
    setTapped(true);
    return start();
  }, [start]);

  const blocked =
    tried && !tapped && state === "denied" && !!error && error.startsWith(REFUSED);

  return { startByTap, blocked };
}

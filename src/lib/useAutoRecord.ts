"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioConsent, useOnboarded } from "./device";
import type { RecorderState } from "./useRecorder";

/**
 * Whether a query string asks the capture screen to start listening.
 *
 * A home-screen shortcut, an Android long-press action, an iPhone Shortcuts
 * button and the native widget all open `/app?record=1`; this is the one place
 * that decides what that means. Only an explicit yes counts, so a stray
 * `?record=0` or `?recording` never turns the microphone on.
 */
export function wantsRecord(search: string): boolean {
  const value = new URLSearchParams(search).get("record");
  return value === "1" || value === "true";
}

/** The recorder's wording for a refusal. Only this one is softened below: a
 *  missing microphone or an insecure page is not something a tap fixes, and
 *  must say so straight away. */
const REFUSED = "Microphone permission was refused";

/**
 * Start recording as soon as the screen opens from a shortcut.
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

  const triedRef = useRef(false);
  const [tried, setTried] = useState(false);
  const [tapped, setTapped] = useState(false);

  const ready =
    onboarded === true &&
    consent !== null &&
    consent !== "unknown" &&
    state === "idle";

  useEffect(() => {
    if (!ready || triedRef.current) return;
    // Read here, not while rendering: the address is not state the screen
    // reacts to, it is a request that arrived with the page, and during an
    // in-app navigation it is only up to date once the page has committed.
    if (!wantsRecord(window.location.search)) return;
    triedRef.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    void start().then(() => setTried(true));
  }, [ready, start]);

  /** The button's own start. A tap ends the "tap to start" explanation. */
  const startByTap = useCallback(() => {
    setTapped(true);
    return start();
  }, [start]);

  const blocked =
    tried && !tapped && state === "denied" && !!error && error.startsWith(REFUSED);

  return { startByTap, blocked };
}

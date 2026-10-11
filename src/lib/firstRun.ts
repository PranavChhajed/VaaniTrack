import { readLocal, removeLocal, writeLocal } from "./localStore";
import { useLocalValue } from "./useLocalValue";

/**
 * What comes after the welcome tour: help with the first expense, then one
 * suggestion for keeping the app a tap away.
 *
 * One key, two stages, and nothing stored once it is over:
 *
 *   "guide"  the capture screen is helping with the first expense
 *   "next"   the first expense is in; one suggestion is showing
 *   absent   finished, or never started (everyone who used the app before this
 *            existed, and anyone who said "Not now")
 *
 * Absent means "show nothing", so a browser that cannot store the key, or one
 * whose storage was wiped, is never followed around by a card it cannot
 * dismiss. Only the tour's own last step starts it.
 */

export const FIRST_RUN_KEY = "vaanitrack.firstRun";

export type FirstRunStage = "guide" | "next" | null;

export function parseStage(raw: string | null | undefined): FirstRunStage {
  return raw === "guide" || raw === "next" ? raw : null;
}

/**
 * Where the stage should be, given how many expenses the journal holds.
 * The guide ends the moment there is one, however it got there (spoken, typed,
 * or checked and saved from a review card).
 */
export function stageFor(stage: FirstRunStage, entries: number): FirstRunStage {
  if (stage === "guide" && entries > 0) return "next";
  return stage;
}

/**
 * Whether finishing the tour should start the guide. Not for someone who
 * already has expenses here: they do not need to be shown how to make one.
 */
export function shouldGuide(entries: number): boolean {
  return entries === 0;
}

/**
 * The one thing to do now, from where the recorder is. The order matters: a
 * card waiting to be checked outranks everything, and an error is only worth
 * mentioning once nothing is in progress.
 */
export function guideLine(now: {
  state: string;
  busy: boolean;
  failed: boolean;
  toCheck: number;
}): { title: string; body: string } {
  if (now.toCheck > 0) {
    return {
      title: "Check it, then save",
      body: "It wasn’t sure of something, so it is showing you first. Fix what is wrong below and save it.",
    };
  }
  if (now.busy) return { title: "Reading it back…", body: "One moment." };
  if (now.state === "recording") {
    return { title: "Say it, then tap to finish", body: "Something like “250 lunch”." };
  }
  if (now.state === "warming" || now.state === "requesting") {
    return {
      title: "Getting the microphone ready…",
      body: "If your phone asks, allow the microphone.",
    };
  }
  if (now.failed) {
    return {
      title: "Try once more, or type it",
      body: "If the microphone won’t start, type “250 lunch” in the box below. It works the same.",
    };
  }
  return {
    title: "Record your first one",
    body: "Tap the button and say what you spent, like “250 lunch”. Or type it in the box below.",
  };
}

export function firstRunStage(): FirstRunStage {
  return parseStage(readLocal(FIRST_RUN_KEY));
}

export function setFirstRunStage(stage: FirstRunStage): void {
  if (stage === null) removeLocal(FIRST_RUN_KEY);
  else writeLocal(FIRST_RUN_KEY, stage);
}

/** The stage, live. Null on the server and while the page is hydrating. */
export function useFirstRunStage(): FirstRunStage {
  return useLocalValue<FirstRunStage>(firstRunStage, null);
}

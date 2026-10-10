"use client";

import { useMemo } from "react";
import { readLocal, writeLocal } from "./localStore";
import { useLocalValue } from "./useLocalValue";
import { DEFAULTS, PAYMENT_OPTIONS, type PaymentMethod } from "./types";

/**
 * What the person has told the app about themselves.
 *
 * The test for a field belonging here is that it changes what happens the
 * next time they say an expense. Name does not clear that bar on its own, so
 * it is deliberately display-only: it labels the profile icon and the You
 * screen and goes nowhere else. In particular it is not sent to the
 * extractor. The extraction prompt is the product, changes to it are measured
 * against real transcripts first (docs/design/SPEED-ACCURACY.md), and no such
 * measurement exists for a name.
 */
export type Settings = {
  /** Stored as typed, so a space in the middle of "Mary Ann" survives the
   *  keystroke that follows it. Trimmed wherever it is shown. */
  name: string;
  /** Filed as the payment method when none is spoken. */
  defaultPayment: PaymentMethod;
  /** True: every capture waits for an OK, however sure the app is. */
  reviewAll: boolean;
  /** True: opening the app on the capture screen starts listening at once.
   *  Off by default: an app that opens the microphone unasked is one people
   *  stop opening in a meeting. */
  openToRecord: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  name: "",
  defaultPayment: DEFAULTS.paymentMethod,
  reviewAll: false,
  openToRecord: false,
};

export const SETTINGS_KEY = "vaanitrack.settings";
export const NAME_MAX = 40;

/**
 * Settings from whatever is in storage, which may be absent, from an older
 * version of the app, or hand-edited. Anything unusable falls back to its
 * default, field by field, so one bad value never discards the others.
 */
export function parseSettings(raw: string | null | undefined): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  let data: Partial<Record<keyof Settings, unknown>>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS;
    data = parsed as typeof data;
  } catch {
    return DEFAULT_SETTINGS;
  }

  const payment = PAYMENT_OPTIONS.find((p) => p === data.defaultPayment);
  return {
    name: typeof data.name === "string" ? data.name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, NAME_MAX) : "",
    defaultPayment: payment ?? DEFAULT_SETTINGS.defaultPayment,
    reviewAll: data.reviewAll === true,
    openToRecord: data.openToRecord === true,
  };
}

/** Read now, outside React: for event handlers and the capture pipeline. */
export function loadSettings(): Settings {
  return parseSettings(readLocal(SETTINGS_KEY));
}

/** Change some settings and keep the rest as they are. */
export function saveSettings(patch: Partial<Settings>): void {
  writeLocal(SETTINGS_KEY, JSON.stringify({ ...loadSettings(), ...patch }));
}

/** Live settings for a component. The defaults until storage has been read. */
export function useSettings(): Settings {
  const raw = useLocalValue<string | null>(() => readLocal(SETTINGS_KEY), null);
  return useMemo(() => parseSettings(raw), [raw]);
}

/** The first letter, for the profile icon. Null when there is no name. */
export function initialOf(name: string): string | null {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase() : null;
}

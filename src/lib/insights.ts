/**
 * What the journal says when you step back from it.
 *
 * Every function here is pure and takes `today` as an argument. None reads the
 * clock, so the same journal gives the same answer in a test, on the server and
 * in the browser, and a screen left open past midnight is a matter for the
 * caller rather than a bug hiding in here.
 *
 * Three rules shape all of it, and each exists because the opposite would put a
 * wrong number on screen:
 *
 *   - A gap is not thrift. A week in which you forgot to log two days reads as
 *     a cheap week. So a comparison is only offered when both weeks were
 *     properly kept, and the number of days with anything noted is always shown
 *     beside the total.
 *   - Nothing here invents a fact. Groups come from the same words the row icons
 *     come from and say so; a fact needs a minimum number of examples before it
 *     is called a fact.
 *   - Dates are compared as local calendar days, as text, never as milliseconds.
 *     Adding 86,400,000 to a timestamp is wrong twice a year in some countries.
 */

import { iconFor, type IconKind } from "./icon";
import { fromISO, parseClock, toISO } from "./journal";
import type { Transaction } from "./types";

/* ------------------------------------------------------------------ *
 * Reading a possibly-damaged record
 *
 * The journal is parsed from browser storage and cast, not validated, so a
 * field that "cannot" be missing can be.
 * ------------------------------------------------------------------ */

function amountOf(t: Transaction): number {
  const v = t.amount?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function hasAmount(t: Transaction): boolean {
  return typeof t.amount?.value === "number" && Number.isFinite(t.amount.value);
}

function dateOf(t: Transaction): string | null {
  const v = t.date?.value;
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/* ------------------------------------------------------------------ *
 * Days
 * ------------------------------------------------------------------ */

/** `iso` moved by whole calendar days. Goes through the Date constructor, which
 *  rolls over month and year ends and daylight-saving changes by itself. */
export function addDays(iso: string, by: number): string {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + by));
}

/** `n` consecutive dates ending on `today`, oldest first. */
export function lastNDays(today: string, n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) days.push(addDays(today, -i));
  return days;
}

/** What each real date cost and held. Future dates and undated entries are not
 *  part of any window, so tomorrow can never leak into "the last 7 days". */
function byDate(transactions: Transaction[], today: string) {
  const days = new Map<string, { total: number; count: number }>();
  for (const t of transactions) {
    const date = dateOf(t);
    if (!date || date > today) continue;
    const day = days.get(date) ?? { total: 0, count: 0 };
    day.total += amountOf(t);
    day.count += 1;
    days.set(date, day);
  }
  return days;
}

function firstDate(transactions: Transaction[], today: string): string | null {
  let first: string | null = null;
  for (const t of transactions) {
    const date = dateOf(t);
    if (date && date <= today && (first === null || date < first)) first = date;
  }
  return first;
}

/* ------------------------------------------------------------------ *
 * This week
 * ------------------------------------------------------------------ */

/** A week is only compared with the one before it when both were kept. */
export const MIN_DAYS_TO_COMPARE = 4;

export interface WeekDay {
  date: string;
  total: number;
  count: number;
}

export type WeekCompare =
  /** Both weeks were kept: `diff` is this week minus the one before. */
  | { kind: "delta"; diff: number }
  /** Not enough to say. Never a number that would pass a gap off as a saving. */
  | { kind: "none" };

export interface WeekSummary {
  /** Seven days, oldest first, the last of them today. */
  days: WeekDay[];
  total: number;
  /** Days of the seven with at least one entry. */
  loggedDays: number;
  /** Entries in the seven days that have no amount. Counted as 0, and said so. */
  withoutAmount: number;
  prevTotal: number;
  prevLoggedDays: number;
  compare: WeekCompare;
}

/**
 * The last seven days, today included, and the seven before them.
 *
 * Seven days ending today rather than "this calendar week", because a week
 * that starts on Monday is nearly empty on Monday and then says so loudly.
 */
export function weekSummary(
  transactions: Transaction[],
  today: string,
): WeekSummary {
  const perDay = byDate(transactions, today);
  const dates = lastNDays(today, 7);
  const prevDates = lastNDays(addDays(today, -7), 7);

  const days = dates.map((date) => ({
    date,
    total: perDay.get(date)?.total ?? 0,
    count: perDay.get(date)?.count ?? 0,
  }));
  const prev = prevDates.map((date) => perDay.get(date));

  const total = days.reduce((s, d) => s + d.total, 0);
  const prevTotal = prev.reduce((s, d) => s + (d?.total ?? 0), 0);
  const loggedDays = days.filter((d) => d.count > 0).length;
  const prevLoggedDays = prev.filter((d) => d && d.count > 0).length;

  const window = new Set(dates);
  const withoutAmount = transactions.filter((t) => {
    const date = dateOf(t);
    return date !== null && window.has(date) && !hasAmount(t);
  }).length;

  // The week before must also start on or after the first entry ever made, or
  // it is "the week before the app was used" and zero spending there is not a
  // fact about spending.
  const first = firstDate(transactions, today);
  const kept =
    loggedDays >= MIN_DAYS_TO_COMPARE &&
    prevLoggedDays >= MIN_DAYS_TO_COMPARE &&
    first !== null &&
    first <= prevDates[0];

  return {
    days,
    total,
    loggedDays,
    withoutAmount,
    prevTotal,
    prevLoggedDays,
    compare: kept ? { kind: "delta", diff: total - prevTotal } : { kind: "none" },
  };
}

/* ------------------------------------------------------------------ *
 * Where it went
 * ------------------------------------------------------------------ */

export const KIND_LABEL: Record<IconKind, string> = {
  food: "Food",
  drink: "Drinks",
  transport: "Getting around",
  shopping: "Shopping",
  bills: "Bills",
  person: "Sent to people",
  receipt: "Everything else",
};

export interface Slice {
  kind: IconKind;
  label: string;
  total: number;
  count: number;
  /** 0 to 1, of everything in the window. */
  share: number;
}

/**
 * The window's spending, grouped by the same words the row icons use.
 *
 * Largest first, with "Everything else" always last whatever its size: it is
 * the honest bucket for what the words did not say, and ranking it above a real
 * group would present a lack of information as a finding. When it is the
 * biggest piece the screen says so rather than hiding it.
 */
export function breakdown(
  transactions: Transaction[],
  from: string,
  to: string,
): Slice[] {
  const slices = new Map<IconKind, { total: number; count: number }>();
  for (const t of transactions) {
    const date = dateOf(t);
    if (!date || date < from || date > to) continue;
    const kind = iconFor(t);
    const slice = slices.get(kind) ?? { total: 0, count: 0 };
    slice.total += amountOf(t);
    slice.count += 1;
    slices.set(kind, slice);
  }

  const sum = [...slices.values()].reduce((s, v) => s + v.total, 0);
  return [...slices.entries()]
    .map(([kind, v]) => ({
      kind,
      label: KIND_LABEL[kind],
      total: v.total,
      count: v.count,
      share: sum > 0 ? v.total / sum : 0,
    }))
    .sort((a, b) => {
      if (a.kind === "receipt") return 1;
      if (b.kind === "receipt") return -1;
      return b.total - a.total;
    });
}

/* ------------------------------------------------------------------ *
 * When you log
 * ------------------------------------------------------------------ */

export type Part = "morning" | "afternoon" | "evening" | "night";

export const PART_LABEL: Record<Part, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

export const PART_HOURS: Record<Part, string> = {
  morning: "5 am to 11",
  afternoon: "11 to 4 pm",
  evening: "4 to 9",
  night: "9 pm to 5 am",
};

/** Enough entries that a split is a habit and not a handful. */
export const MIN_FOR_WHEN = 15;

function partOfMinutes(minutes: number): Part {
  const hour = Math.floor(minutes / 60);
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 16) return "afternoon";
  if (hour >= 16 && hour < 21) return "evening";
  return "night";
}

export interface WhenSummary {
  /** What the split is made from. "logged" is when the entry was noted down,
   *  which is a habit and not a claim about when the money was spent. */
  basis: "logged" | "spoken";
  parts: { part: Part; label: string; count: number; total: number }[];
  n: number;
  top: Part;
}

/**
 * When in the day entries get made.
 *
 * No entry in the real journal has a spoken time, so this is made from when
 * each was logged, and is titled and worded that way. It never reads as "when
 * you spend": people note things down in batches, and a night-time peak
 * mostly means "I do my logging at night". Once at least `MIN_FOR_WHEN`
 * entries carry a time that was actually said, it switches to those alone and
 * the claim becomes true.
 */
export function whenSummary(transactions: Transaction[]): WhenSummary | null {
  const spoken: [Part, number][] = [];
  const logged: [Part, number][] = [];

  for (const t of transactions) {
    const clock = parseClock(t.time?.value ?? null);
    if (clock !== null) spoken.push([partOfMinutes(clock), amountOf(t)]);

    const at = t.createdAt ? new Date(t.createdAt) : null;
    if (at && !Number.isNaN(at.getTime())) {
      logged.push([partOfMinutes(at.getHours() * 60 + at.getMinutes()), amountOf(t)]);
    }
  }

  const useSpoken = spoken.length >= MIN_FOR_WHEN;
  const rows = useSpoken ? spoken : logged;
  if (rows.length < MIN_FOR_WHEN) return null;

  const order: Part[] = ["morning", "afternoon", "evening", "night"];
  const parts = order.map((part) => ({
    part,
    label: PART_LABEL[part],
    count: rows.filter(([p]) => p === part).length,
    total: rows.filter(([p]) => p === part).reduce((s, [, a]) => s + a, 0),
  }));
  const top = parts.reduce((a, b) => (b.count > a.count ? b : a)).part;

  return { basis: useSpoken ? "spoken" : "logged", parts, n: rows.length, top };
}

/* ------------------------------------------------------------------ *
 * Fun facts
 * ------------------------------------------------------------------ */

export interface Fact {
  id: string;
  /** The whole sentence. */
  text: string;
}

const THRESHOLD = { chai: 5, repeat: 4, priciestDays: 7, logWindow: 7 };

/** "2 Chai " and "chai" are the same thing said twice. */
function normalizeItem(description: string | null | undefined): string {
  if (!description) return "";
  return description
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/^\s*(a|an|one|two|three|four|five|six|some)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function rupees(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function dayName(iso: string): string {
  return fromISO(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * Everything worth saying right now, each only if there is enough behind it.
 * The set is recomputed from the live journal every time, never stored, so a
 * deleted entry cannot linger inside a sentence.
 */
export function facts(transactions: Transaction[], today: string): Fact[] {
  const out: Fact[] = [];
  const perDay = byDate(transactions, today);
  const last30 = new Set(lastNDays(today, 30));

  const live = transactions.filter((t) => {
    const date = dateOf(t);
    return date !== null && date <= today;
  });

  // Chai and tea, this past month.
  const chai = live.filter(
    (t) =>
      last30.has(dateOf(t) as string) &&
      /\b(chai|tea)\b/i.test(t.description?.value ?? ""),
  );
  if (chai.length >= THRESHOLD.chai) {
    out.push({
      id: "chai",
      text: `Chai and tea: ${chai.length} in the last 30 days, ${rupees(
        chai.reduce((s, t) => s + amountOf(t), 0),
      )}. You and chai are close.`,
    });
  }

  // The most expensive day, once there are enough days to call it that.
  if (perDay.size >= THRESHOLD.priciestDays) {
    let best: [string, number] | null = null;
    for (const [date, d] of perDay) {
      if (best === null || d.total > best[1] || (d.total === best[1] && date < best[0])) {
        best = [date, d.total];
      }
    }
    if (best && best[1] > 0) {
      out.push({
        id: "priciest",
        text: `Your priciest day so far was ${dayName(best[0])}: ${rupees(best[1])}.`,
      });
    }
  }

  // The thing said most often.
  const said = new Map<string, number>();
  for (const t of live) {
    const item = normalizeItem(t.description?.value);
    if (item) said.set(item, (said.get(item) ?? 0) + 1);
  }
  let top: [string, number] | null = null;
  for (const [item, n] of said) {
    if (top === null || n > top[1] || (n === top[1] && item < top[0])) top = [item, n];
  }
  if (top && top[1] >= THRESHOLD.repeat) {
    out.push({
      id: "repeat",
      text: `You’ve logged “${top[0]}” ${top[1]} times. A regular.`,
    });
  }

  // How often the journal is kept, over a window that does not reach back
  // before the first entry, so it never counts days the app did not exist.
  const first = firstDate(transactions, today);
  if (first) {
    const span = lastNDays(today, 30).filter((d) => d >= first);
    if (span.length >= THRESHOLD.logWindow) {
      const logged = span.filter((d) => (perDay.get(d)?.count ?? 0) > 0).length;
      out.push({
        id: "kept",
        text: `You noted something on ${logged} of the last ${span.length} days.`,
      });
    }
  }

  return out;
}

/** The same fact all day, a different one on another day. */
export function pickFact(list: Fact[], today: string, shift = 0): Fact | null {
  if (list.length === 0) return null;
  let seed = 0;
  for (const ch of today) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return list[(seed + shift) % list.length];
}

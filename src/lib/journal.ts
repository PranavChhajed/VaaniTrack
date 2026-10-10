/**
 * Journal data layer: Phase A.
 *
 * Everything the journal knows about grouping, totalling, ordering and time
 * lives here rather than in a component, because display and sort order have to
 * agree. A row that shows one thing and sorts by another is how a journal
 * quietly starts lying about chronology.
 *
 * See docs/VAANITRACK_PHASE_A_JOURNAL_CONTEXT.md §9, §11-§13, §31.
 */

import type { Transaction } from "./types";

/* ------------------------------------------------------------------ *
 * Mutations
 *
 * The journal is a view over the same records the voice pipeline writes
 * (§31). These return new arrays rather than mutating, so React state
 * updates stay honest.
 * ------------------------------------------------------------------ */

export function updateTransaction(
  list: Transaction[],
  id: string,
  next: Transaction,
): Transaction[] {
  return list.map((t) => (t.id === id ? next : t));
}

export function deleteTransaction(
  list: Transaction[],
  id: string,
): Transaction[] {
  return list.filter((t) => t.id !== id);
}

/* ------------------------------------------------------------------ *
 * Clock parsing
 * ------------------------------------------------------------------ */

/**
 * A spoken time in minutes since midnight, or null when it cannot be read.
 *
 * The extractor is told to store a clock time only when one was actually
 * spoken, and it is not told what shape to write it in, so "10:42 AM",
 * "22:15" and "1 PM" all reach here. Anything unparseable is treated as
 * *unknown* for ordering while still being shown as written: better to
 * display a value we cannot sort by than to sort by a value we invented.
 */
export function parseClock(raw: string | null): number | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();

  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];

  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (minute > 59) return null;

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23) return null;

  return hour * 60 + minute;
}

/* ------------------------------------------------------------------ *
 * Time display: §11, §12
 * ------------------------------------------------------------------ */

export type TimeDisplay =
  /** A time the user actually spoke. This is when the spending happened. */
  | { kind: "transaction"; text: string }
  /** When VaaniTrack recorded it. Never a claim about when it happened. */
  | { kind: "logged"; text: string }
  /** Nothing honest to show. */
  | { kind: "none" };

function clockText(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function dateText(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/**
 * What time, if any, a row may show.
 *
 * Three cases, and the third is the one that matters:
 *
 * 1. A time was spoken -> show it. It is real.
 * 2. No time, and the transaction is dated the day it was logged -> show the
 *    logging time, labelled, e.g. "logged 9:40 PM".
 * 3. No time, and the transaction is dated a *different* day -> show the
 *    logging date as well, e.g. "logged 6 Sep, 9:40 PM".
 *
 * Case 3 exists because "logged 9:40 PM" sitting under a 2 September heading
 * reads as 9:40 PM *on 2 September*, which is false for anything backdated or
 * moved by an edit. §30 names this failure explicitly; carrying the date is
 * what stops the label contradicting the heading above it.
 */
export function timeDisplay(t: Transaction): TimeDisplay {
  if (t.time.value) {
    return { kind: "transaction", text: t.time.value };
  }
  if (!t.createdAt) return { kind: "none" };

  // The local calendar day it was logged on. Slicing the ISO string would
  // give the UTC day, which is still yesterday for the first five and a half
  // hours of an Indian morning, and a 1 AM entry would then be labelled as if
  // it had been backdated.
  const loggedOn = toISO(new Date(t.createdAt));
  const sameDay = t.date.value !== null && t.date.value === loggedOn;

  return {
    kind: "logged",
    text: sameDay
      ? `logged ${clockText(t.createdAt)}`
      : `logged ${dateText(t.createdAt)}, ${clockText(t.createdAt)}`,
  };
}

/* ------------------------------------------------------------------ *
 * Grouping and ordering: §8, §13
 * ------------------------------------------------------------------ */

export interface DayGroup {
  /** ISO date, or null for transactions with no date at all. */
  date: string | null;
  total: number;
  count: number;
  /** Transactions with a readable spoken time, newest first. */
  timed: Transaction[];
  /** Transactions whose time is unknown, most recently logged first. */
  untimed: Transaction[];
}

/**
 * Group by *transaction* date, the day the spending happened, never by the
 * day the record was created (§9, §30).
 *
 * Within a day the two sets are kept apart deliberately. Sorting a
 * known 10:30 AM, a known 1:15 PM and an unknown-time coffee into one list
 * necessarily puts the coffee somewhere, and wherever it lands reads as a
 * claim about when it happened. Speech order is not evidence: saying "coffee"
 * after "lunch" does not mean it was bought later (§12, §13).
 *
 * So: known times form a chronology, unknown times form a group beneath it,
 * and nothing untimed is ever placed between two known times.
 */
export function groupByDay(transactions: Transaction[]): DayGroup[] {
  const buckets = new Map<string, Transaction[]>();

  for (const t of transactions) {
    const key = t.date.value ?? "";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(t);
    else buckets.set(key, [t]);
  }

  const groups: DayGroup[] = [];

  for (const [key, rows] of buckets) {
    const timed: Transaction[] = [];
    const untimed: Transaction[] = [];

    for (const t of rows) {
      if (parseClock(t.time.value) !== null) timed.push(t);
      else untimed.push(t);
    }

    // Newest first within the day, matching the ledger above it.
    timed.sort((a, b) => (parseClock(b.time.value) ?? 0) - (parseClock(a.time.value) ?? 0));
    // No time to sort by, so fall back to when it was recorded. This orders
    // the rows without implying anything about when the spending happened.
    untimed.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    groups.push({
      date: key || null,
      total: rows.reduce((sum, t) => sum + (t.amount.value ?? 0), 0),
      count: rows.length,
      timed,
      untimed,
    });
  }

  // Newest day first. Undated transactions sink to the bottom rather than
  // being dropped; they are still real records.
  groups.sort((a, b) => {
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return b.date.localeCompare(a.date);
  });

  return groups;
}

export interface MonthGroup {
  /** First day of the month as ISO, or null for transactions with no date. */
  month: string | null;
  /** "September 2026", or "No date". */
  label: string;
  total: number;
  count: number;
  days: DayGroup[];
}

/**
 * Gather days into the months they belong to, preserving day order.
 *
 * A running all-time figure answers a question nobody asks. A month is the
 * unit people actually budget in: rent, salary and bills all land on that
 * cycle, so the totals worth showing are monthly ones.
 *
 * Days keep the order `groupByDay` put them in, so the continuous scroll
 * through history is unchanged; this only adds a rule and a subtotal each
 * time the scroll crosses into a different month. Undated transactions stay
 * last, in a month of their own, because they belong to no calendar month and
 * folding them into one would invent a fact.
 */
export function groupByMonth(days: DayGroup[]): MonthGroup[] {
  const months: MonthGroup[] = [];

  for (const day of days) {
    const month = day.date ? `${day.date.slice(0, 7)}-01` : null;
    const last = months[months.length - 1];

    if (last && last.month === month) {
      last.days.push(day);
      last.total += day.total;
      last.count += day.count;
      continue;
    }

    months.push({
      month,
      label: month ? monthLabel(month) : "No date",
      total: day.total,
      count: day.count,
      days: [day],
    });
  }

  return months;
}

/** What the calendar month containing `iso` has cost. */
export function monthTotal(transactions: Transaction[], iso: string): number {
  const key = iso.slice(0, 7);
  return transactions.reduce(
    (sum, t) =>
      t.date.value?.startsWith(key) ? sum + (t.amount.value ?? 0) : sum,
    0,
  );
}

/** Every transaction on one date, in the same order the journal would show. */
export function forDate(transactions: Transaction[], iso: string): DayGroup {
  const only = transactions.filter((t) => t.date.value === iso);
  const grouped = groupByDay(only);
  return (
    grouped[0] ?? { date: iso, total: 0, count: 0, timed: [], untimed: [] }
  );
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

export function todayISO(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** Parse an ISO date as *local* midnight, not UTC. */
export function fromISO(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function toISO(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function isFuture(iso: string): boolean {
  return iso > todayISO();
}

/**
 * "Today", "Yesterday", or a written date.
 *
 * Deliberately locale-driven for the written form. Month and year boundaries
 * need no special handling here because the comparison is done on whole days,
 * not on day-of-month arithmetic (§28).
 */
export function dayLabel(iso: string | null): string {
  if (!iso) return "No date";
  const date = fromISO(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const today = fromISO(todayISO());
  const diff = Math.round((today.getTime() - date.getTime()) / 86_400_000);

  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    // Only name the year once it is not the current one.
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export function monthLabel(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** Shift a month, keeping the day where possible. Used by the picker. */
export function shiftMonth(iso: string, by: number): string {
  const date = fromISO(iso);
  const target = new Date(date.getFullYear(), date.getMonth() + by, 1);
  return toISO(target);
}

/**
 * A month laid out as calendar weeks, Sunday first, padded with nulls.
 *
 * Pure date arithmetic through the Date constructor, which rolls over month
 * and year boundaries on its own, so December to January needs no special
 * case (§28).
 */
export function monthGrid(iso: string): (string | null)[][] {
  const anchor = fromISO(iso);
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (string | null)[] = Array(first.getDay()).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(toISO(new Date(year, month, day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * What each date cost, for the calendar.
 *
 * A date is present only if something is recorded on it, so presence still
 * answers "is there anything here?" even for a day whose entries total zero.
 */
export function dayTotals(transactions: Transaction[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (!t.date.value) continue;
    totals.set(t.date.value, (totals.get(t.date.value) ?? 0) + (t.amount.value ?? 0));
  }
  return totals;
}

/**
 * An amount short enough to sit under a date in a calendar cell.
 *
 * Indian units, because that is how these amounts are said: 1,500 is "1.5k",
 * 1,50,000 is "1.5L". Truncated rather than rounded, so the cell never shows
 * more than was spent; the exact figure is one tap away in the day itself.
 */
export function compactAmount(amount: number): string {
  const units: [number, string][] = [
    [1e7, "Cr"],
    [1e5, "L"],
    [1e3, "k"],
  ];
  for (const [size, suffix] of units) {
    if (amount < size) continue;
    const scaled = amount / size;
    const shown =
      scaled >= 10 ? Math.floor(scaled) : Math.floor(scaled * 10) / 10;
    return `${shown}${suffix}`;
  }
  return String(Math.floor(amount));
}

/**
 * Turns the words someone used for a day into that day.
 *
 * "yesterday", "day before yesterday", "two days ago", "last Friday", "on the 3rd",
 * "September 3rd", "this morning", "last night".
 *
 * Why code and not the model: working out which date "last Friday" is needs
 * today's date and weekday and some calendar arithmetic, and a language model
 * does that wrongly often enough to matter. The model's only job is to quote the
 * words that were spoken about the day (`dateWords`); this does the rest, from the
 * speaker's own date, so it cannot repeat the old UTC-midnight mistake.
 *
 * Everything works on `yyyy-mm-dd` text and `Date.UTC`, never on local time or on
 * adding milliseconds, so a daylight-saving change or the machine's timezone
 * cannot move a date. A phrase that is not clearly one day ("last week", "a
 * couple of days ago") resolves to nothing, and the caller asks instead of guessing.
 * A day in the future never resolves: nobody has spent it yet.
 */

export type ResolvedDay = {
  /** yyyy-mm-dd */
  date: string;
  /** What the words said about the part of the day, when they did. */
  partOfDay: "morning" | "afternoon" | "evening" | "night" | null;
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_ALIASES: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};
const MONTH_NAMES: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const SMALL: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function parts(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
    ? { y, m, d }
    : null;
}

/** The day `n` days after `iso` (negative for before), by calendar and not by milliseconds of local time. */
export function shiftDay(iso: string, n: number): string | null {
  const p = parts(iso);
  if (!p) return null;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function weekdayOf(iso: string): number | null {
  const p = parts(iso);
  return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() : null;
}

/** The most recent occurrence of day-of-month `d` (optionally of month `m`) that is not after `today`. */
function recentDayOfMonth(today: string, d: number, m: number | null): string | null {
  const t = parts(today);
  if (!t || d < 1 || d > 31) return null;
  if (m !== null) {
    for (const y of [t.y, t.y - 1]) {
      const candidate = parts(toISO(y, m, d));
      if (candidate && toISO(y, m, d) <= today) return toISO(y, m, d);
    }
    return null;
  }
  // No month: this month if that day has passed or is today, else the month before
  // (skipping months too short to have it).
  let y = t.y, mo = t.m;
  for (let i = 0; i < 14; i++) {
    const candidate = parts(toISO(y, mo, d));
    if (candidate && toISO(y, mo, d) <= today) return toISO(y, mo, d);
    mo--;
    if (mo === 0) { mo = 12; y--; }
  }
  return null;
}

function partOfDayIn(text: string): ResolvedDay["partOfDay"] {
  if (/\bmorning\b/.test(text)) return "morning";
  if (/\bafternoon\b/.test(text)) return "afternoon";
  if (/\bevening\b/.test(text)) return "evening";
  if (/\bnight\b|\btonight\b/.test(text)) return "night";
  return null;
}

/**
 * The day the words mean, or null when they do not say one clearly.
 * `today` is the speaker's own calendar date, yyyy-mm-dd.
 */
export function resolveDateWords(words: string | null | undefined, today: string): ResolvedDay | null {
  if (!words || !parts(today)) return null;
  const text = words.toLowerCase().replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const partOfDay = partOfDayIn(text);
  const day = (iso: string | null): ResolvedDay | null =>
    iso && iso <= today ? { date: iso, partOfDay } : null;

  // Things that are not one day, or not in the past.
  if (/\btomorrow\b|\bnext\b|\bcouple\b|\bfew\b|\blast (week|month|year)\b|\bthis (week|month|year)\b/.test(text)) {
    return null;
  }

  if (/\bday before yesterday\b|\bparso\b/.test(text)) return day(shiftDay(today, -2));
  if (/\byesterday\b|\bkal\b/.test(text)) return day(shiftDay(today, -1));
  if (/\blast night\b|\blast evening\b/.test(text)) return day(shiftDay(today, -1));
  if (/\btoday\b|\bthis (morning|afternoon|evening)\b|\btonight\b|\baaj\b/.test(text)) return day(today);

  // "two days ago", "3 days ago", "a week ago", "two weeks ago"
  const ago = /\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) (day|days|week|weeks) ago\b/.exec(text);
  if (ago) {
    const n = /^\d+$/.test(ago[1]) ? Number(ago[1]) : SMALL[ago[1]];
    return n >= 1 && n <= 60 ? day(shiftDay(today, -(ago[2].startsWith("week") ? n * 7 : n))) : null;
  }

  // "last friday", "on friday", "friday", "this friday"
  const weekday = Object.keys(WEEKDAY_ALIASES).find((name) => new RegExp(`\\b${name}\\b`).test(text));
  if (weekday) {
    const target = WEEKDAY_ALIASES[weekday];
    const now = weekdayOf(today)!;
    let back = (now - target + 7) % 7;
    // "last friday" on a Friday is a week ago; a bare "friday" on a Friday is today.
    if (back === 0 && /\blast\b/.test(text)) back = 7;
    return day(shiftDay(today, -back));
  }

  // "3rd september", "september 3rd", "3 september", "3rd of september"
  const monthWord = Object.keys(MONTH_NAMES).find((name) => new RegExp(`\\b${name}\\b`).test(text));
  const dayNumber = /\b(\d{1,2})(?:st|nd|rd|th)?\b/.exec(text.replace(/\b(19|20)\d{2}\b/g, ""));
  if (monthWord && dayNumber) {
    return day(recentDayOfMonth(today, Number(dayNumber[1]), MONTH_NAMES[monthWord]));
  }

  // "the 3rd", "on the 15th"
  const ordinal = /\b(\d{1,2})(?:st|nd|rd|th)\b/.exec(text);
  if (ordinal) return day(recentDayOfMonth(today, Number(ordinal[1]), null));

  return null;
}

/** For tests and logs. */
export const weekdayName = (n: number) => WEEKDAYS[n] ?? null;

/**
 * Checks for the spoken-date resolver. Run: npx tsx scripts/dates.test.ts
 *
 * Fixed "today" values chosen on the awkward days: a month start, a year start,
 * a leap day, a Friday, a Monday. The same answers must come out in any machine
 * timezone, which is why scripts are run under three of them.
 */
import { resolveDateWords, shiftDay, weekdayOf } from "../src/lib/dates.ts";

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}` +
      (ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`),
  );
}
const date = (words: string, today: string) => resolveDateWords(words, today)?.date ?? null;

// 2026-10-09 is a Friday; 2026-10-12 a Monday; 2026-03-01 a Sunday.
check("weekday of a Friday", weekdayOf("2026-10-09"), 5);
check("weekday of a Monday", weekdayOf("2026-10-12"), 1);
check("a bad date has no weekday", weekdayOf("2026-02-30"), null);

console.log("--- shifting a day");
check("back over a month start", shiftDay("2026-10-01", -1), "2026-09-30");
check("back over a year start", shiftDay("2026-01-01", -1), "2025-12-31");
check("back onto a leap day", shiftDay("2028-03-01", -1), "2028-02-29");
check("no leap day in 2026", shiftDay("2026-03-01", -1), "2026-02-28");
check("back across a daylight change", shiftDay("2026-03-09", -3), "2026-03-06");
check("forward", shiftDay("2026-12-31", 1), "2027-01-01");
check("not a date", shiftDay("nope", 1), null);

console.log("--- the plain words");
check("today", date("today", "2026-10-11"), "2026-10-11");
check("yesterday", date("yesterday", "2026-10-11"), "2026-10-10");
check("yesterday over a month start", date("yesterday", "2026-10-01"), "2026-09-30");
check("day before yesterday", date("day before yesterday", "2026-10-11"), "2026-10-09");
check("this morning", date("this morning", "2026-10-11"), "2026-10-11");
check("this evening", date("this evening", "2026-10-11"), "2026-10-11");
check("tonight", date("tonight", "2026-10-11"), "2026-10-11");
check("last night is yesterday", date("last night", "2026-10-11"), "2026-10-10");
check("with punctuation and capitals", date("Yesterday,", "2026-10-11"), "2026-10-10");

console.log("--- part of the day");
check("this morning", resolveDateWords("this morning", "2026-10-11")?.partOfDay, "morning");
check("last night", resolveDateWords("last night", "2026-10-11")?.partOfDay, "night");
check("yesterday evening", resolveDateWords("yesterday evening", "2026-10-11"), { date: "2026-10-10", partOfDay: "evening" });
check("no part of day", resolveDateWords("yesterday", "2026-10-11")?.partOfDay, null);

console.log("--- days ago");
check("two days ago", date("two days ago", "2026-10-11"), "2026-10-09");
check("3 days ago", date("3 days ago", "2026-10-11"), "2026-10-08");
check("a day ago", date("a day ago", "2026-10-11"), "2026-10-10");
check("a week ago", date("a week ago", "2026-10-11"), "2026-10-04");
check("two weeks ago", date("two weeks ago", "2026-10-11"), "2026-09-27");
check("over a year start", date("ten days ago", "2026-01-05"), "2025-12-26");
check("a couple of days ago is not one day", date("a couple of days ago", "2026-10-11"), null);
check("last week is not one day", date("last week", "2026-10-11"), null);
check("last month is not one day", date("last month", "2026-10-11"), null);

console.log("--- weekdays");
check("last friday, from a sunday", date("last Friday", "2026-10-11"), "2026-10-09");
check("on friday, from a sunday", date("on Friday", "2026-10-11"), "2026-10-09");
check("friday said on a friday is today", date("Friday", "2026-10-09"), "2026-10-09");
check("last friday said on a friday is a week ago", date("last Friday", "2026-10-09"), "2026-10-02");
check("monday from a friday", date("on monday", "2026-10-09"), "2026-10-05");
check("sunday from a monday", date("sunday", "2026-10-12"), "2026-10-11");
check("abbreviation", date("last fri", "2026-10-11"), "2026-10-09");
check("over a month start", date("last wednesday", "2026-10-02"), "2026-09-30");

console.log("--- calendar days");
check("3rd of september", date("3rd of September", "2026-10-11"), "2026-09-03");
check("september 3rd", date("September 3rd", "2026-10-11"), "2026-09-03");
check("3 september", date("3 september", "2026-10-11"), "2026-09-03");
check("a month still ahead means last year", date("December 25th", "2026-10-11"), "2025-12-25");
check("this month, a day gone by", date("the 3rd", "2026-10-11"), "2026-10-03");
check("this month, a day still to come", date("the 15th", "2026-10-11"), "2026-09-15");
check("today's own day", date("the 11th", "2026-10-11"), "2026-10-11");
check("a day a short month lacks", date("the 31st", "2026-10-11"), "2026-08-31");
check("feb 29 in a leap year", date("29th February", "2028-03-05"), "2028-02-29");
check("feb 29 with no leap year behind it", date("29th February", "2026-03-05"), null);
check("a year said aloud is ignored", date("3rd of September 2026", "2026-10-11"), "2026-09-03");

console.log("--- not a day, or not yet");
check("tomorrow", date("tomorrow", "2026-10-11"), null);
check("next friday", date("next Friday", "2026-10-11"), null);
check("nothing", date("", "2026-10-11"), null);
check("null", date(null as unknown as string, "2026-10-11"), null);
check("words that say no day", date("for the party", "2026-10-11"), null);
check("a bad today", date("yesterday", "garbage"), null);

console.log(failures === 0 ? "\nall passed\n" : `\n${failures} FAILED\n`);
process.exit(failures ? 1 : 0);

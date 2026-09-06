/**
 * Data-layer checks for the journal. Run: npx tsx scripts/journal.test.ts
 *
 * These exist because the ordering rule (§13) is easy to write and easy to get
 * subtly wrong: the failure is not a crash, it is a row sitting in a position
 * that implies a time nobody knows.
 */

import {
  parseClock,
  timeDisplay,
  groupByDay,
  groupByMonth,
  monthTotal,
  monthGrid,
  shiftMonth,
  isFuture,
  todayISO,
} from "../src/lib/journal.ts";
import type { Field, Provenance, Transaction } from "../src/lib/types.ts";

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}` +
      (ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`),
  );
}

const f = <T>(value: T | null, provenance: Provenance = "said"): Field<T> => ({
  value,
  provenance,
});

function txn(over: {
  id: string;
  amount?: number;
  description?: string;
  date?: string | null;
  time?: string | null;
  createdAt?: string;
}): Transaction {
  return {
    id: over.id,
    amount: f(over.amount ?? 100),
    description: f(over.description ?? "thing"),
    category: f(null, "unknown"),
    payee: f(null, "unknown"),
    paymentMethod: f("UPI", "default"),
    date: f(over.date === undefined ? "2026-09-06" : over.date, "default"),
    time: f(over.time ?? null, over.time ? "said" : "unknown"),
    createdAt: over.createdAt ?? "2026-09-06T21:40:00.000Z",
    source: "voice",
  };
}

console.log("\n--- parseClock ---");
check("10:42 AM", parseClock("10:42 AM"), 642);
check("1 PM", parseClock("1 PM"), 780);
check("22:15", parseClock("22:15"), 1335);
check("12 AM is midnight", parseClock("12 AM"), 0);
check("12 PM is noon", parseClock("12 PM"), 720);
check("null", parseClock(null), null);
check("garbage is unknown, not zero", parseClock("sometime"), null);
check("impossible minute rejected", parseClock("10:75"), null);

console.log("\n--- timeDisplay ---");
check(
  "spoken time is shown as the transaction time",
  timeDisplay(txn({ id: "a", time: "10:42 AM" })),
  { kind: "transaction", text: "10:42 AM" },
);
{
  const sameDay = timeDisplay(txn({ id: "b", date: "2026-09-06", createdAt: "2026-09-06T16:10:00.000Z" }));
  check("same-day logged stamp carries no date", sameDay.kind === "logged" && !/,/.test(sameDay.text), true);
}
{
  // The case §30 forbids getting wrong: dated 2 Sept, logged 6 Sept.
  const moved = timeDisplay(txn({ id: "c", date: "2026-09-02", createdAt: "2026-09-06T16:10:00.000Z" }));
  check("backdated logged stamp carries the date", moved.kind === "logged" && /,/.test(moved.text), true);
}

console.log("\n--- groupByDay: unknown time never implies chronology ---");
{
  const rows = [
    txn({ id: "breakfast", time: "10:30 AM", createdAt: "2026-09-06T05:00:00.000Z" }),
    txn({ id: "lunch", time: "1:15 PM", createdAt: "2026-09-06T08:00:00.000Z" }),
    // Spoken last, no time. Must NOT land between the two known times.
    txn({ id: "coffee", time: null, createdAt: "2026-09-06T09:00:00.000Z" }),
  ];
  const [day] = groupByDay(rows);
  check("timed rows are separated from untimed", [day.timed.map((t) => t.id), day.untimed.map((t) => t.id)], [["lunch", "breakfast"], ["coffee"]]);
  check("day total sums every row", day.total, 300);
  check("count includes untimed rows", day.count, 3);
}

console.log("\n--- groupByDay: days ---");
{
  const rows = [
    txn({ id: "old", date: "2026-09-02" }),
    txn({ id: "new", date: "2026-09-06" }),
    txn({ id: "undated", date: null }),
  ];
  const groups = groupByDay(rows);
  check("newest day first, undated last", groups.map((g) => g.date), ["2026-09-06", "2026-09-02", null]);
}
{
  // Grouping must follow the transaction date, never created_at (§9, §30).
  const rows = [txn({ id: "backdated", date: "2026-09-02", createdAt: "2026-09-06T21:40:00.000Z" })];
  check("grouped by transaction date, not creation", groupByDay(rows)[0].date, "2026-09-02");
}

console.log("\n--- month boundaries (§28) ---");
check("December rolls to January", shiftMonth("2026-12-15", 1).slice(0, 7), "2027-01");
check("January rolls back to December", shiftMonth("2027-01-15", -1).slice(0, 7), "2026-12");
{
  const feb = monthGrid("2028-02-01").flat().filter(Boolean);
  check("leap February has 29 days", feb.length, 29);
}
{
  const sep = monthGrid("2026-09-01");
  check("every week is 7 cells", sep.every((w) => w.length === 7), true);
  check("first real day is the 1st", sep.flat().filter(Boolean)[0], "2026-09-01");
}

console.log("\n--- future dates ---");
check("today is not future", isFuture(todayISO()), false);
check("2099 is future", isFuture("2099-01-01"), true);

console.log("\n--- months ---");
{
  const rows = [
    txn({ id: "a", amount: 250, date: "2026-09-06" }),
    txn({ id: "b", amount: 200, date: "2026-09-04" }),
    txn({ id: "c", amount: 300, date: "2026-08-29" }),
    txn({ id: "d", amount: 50, date: null }),
  ];
  const months = groupByMonth(groupByDay(rows));

  check("one section per month, plus undated", months.length, 3);
  check("newest month first", months[0].label.startsWith("September"), true);
  check("month total sums its days", months[0].total, 450);
  check("August stays a separate section", months[1].total, 300);
  check("undated sinks to its own section, last", months[2].month, null);
  check("undated section is labelled honestly", months[2].label, "No date");
  check(
    "days keep their order inside a month",
    months[0].days.map((d) => d.date),
    ["2026-09-06", "2026-09-04"],
  );
  check("no day is lost to grouping", months.reduce((n, m) => n + m.days.length, 0), 4);

  check("monthTotal counts only that month", monthTotal(rows, "2026-09-15"), 450);
  check("monthTotal excludes undated rows", monthTotal(rows, "2026-08-01"), 300);
  check("a month with nothing in it totals zero", monthTotal(rows, "2026-07-01"), 0);
}

console.log(
  failures === 0 ? "\nall passed\n" : `\n${failures} FAILED\n`,
);
process.exit(failures ? 1 : 0);

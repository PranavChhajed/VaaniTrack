import type { Transaction } from "./types";

/**
 * The journal as a spreadsheet file.
 *
 * Plain CSV rather than a spreadsheet format: every phone and every
 * spreadsheet app opens it, and a person who wants to leave can see exactly
 * what they are taking. It carries what the journal shows, plus the words the
 * entry was made from, which is the one thing that lets them check a total
 * against what they said.
 */
const HEADER = [
  "Date",
  "Time",
  "Amount (INR)",
  "Description",
  "Category",
  "Paid to",
  "Paid with",
  "Entered by",
  "Logged at",
  "You said",
];

/**
 * One text cell, quoted where needed and made safe to open.
 *
 * A spreadsheet treats a cell that starts with `=`, `+`, `-` or `@` as a
 * formula. These cells hold speech, which can say anything, so a leading one
 * is defused with an apostrophe rather than trusted.
 */
function text(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Newest day first, and within a day the most recently logged first. */
function newestFirst(a: Transaction, b: Transaction): number {
  const byDate = (b.date.value ?? "").localeCompare(a.date.value ?? "");
  return byDate !== 0 ? byDate : (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
}

export function toCsv(transactions: Transaction[]): string {
  const rows = [...transactions].sort(newestFirst).map((t) =>
    [
      t.date.value ?? "",
      text(t.time.value),
      t.amount.value === null ? "" : String(t.amount.value),
      text(t.description.value),
      text(t.category.value),
      text(t.payee.value),
      text(t.paymentMethod.value),
      t.source === "voice" ? "Voice" : "Typed",
      t.createdAt ?? "",
      text(t.transcript),
    ].join(","),
  );
  // CRLF is what the CSV standard asks for and what spreadsheets expect.
  return [HEADER.join(","), ...rows].join("\r\n") + "\r\n";
}

export function csvFileName(today: string): string {
  return `vaanitrack-journal-${today}.csv`;
}

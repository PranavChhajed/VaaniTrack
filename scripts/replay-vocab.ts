import type { Transaction } from "../src/lib/types.ts";

const TERM_LIMIT = 12;

/**
 * The words a journal keeps using, most used first: the hint list for the
 * vocabulary experiment in replay.ts.
 *
 * Not part of the app. The idea was that a shop name or a habit ("Chai Kings",
 * "parking") is what a general speech model has never heard and one person
 * says every other day, so the journal itself is the best vocabulary list
 * there is. Replayed against 103 real recordings it made transcription worse;
 * see docs/design/SPEED-ACCURACY.md. Kept so the experiment can be rerun
 * against a different model.
 */
export function buildVocab(transactions: Transaction[]): string[] {
  const seen = new Map<string, { term: string; count: number; latest: string }>();

  for (const t of transactions) {
    for (const raw of [t.description.value, t.payee.value]) {
      const term = raw?.replace(/\s+/g, " ").trim();
      if (!term || term.length > 24 || /\d/.test(term)) continue;
      if (term.split(" ").length > 3) continue;

      const key = term.toLowerCase();
      const entry = seen.get(key);
      if (entry) {
        entry.count += 1;
        if (t.createdAt > entry.latest) entry.latest = t.createdAt;
      } else {
        seen.set(key, { term, count: 1, latest: t.createdAt ?? "" });
      }
    }
  }

  return [...seen.values()]
    .sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest))
    .slice(0, TERM_LIMIT)
    .map((entry) => entry.term);
}

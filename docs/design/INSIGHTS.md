# Insights

A third tab, `/insights`, that steps back from the journal: this week, where it
went, one fun fact, and when you log. Worked out on the phone from the journal;
nothing is sent anywhere and nothing is stored.

Decisions were argued by three reviewers before any code (a data analyst, a
product designer, a senior engineer). What changed, and why, is below.

## What is on the screen

| Card | What it shows | Rule that keeps it true |
|---|---|---|
| Last 7 days | Total, seven day bars (today solid), "₹X less/more than the week before" | The comparison appears only when **both** weeks have at least 4 days with entries **and** the earlier week starts on or after the first entry ever made. Otherwise: "Keep noting, and this will compare with last week." "Noted on N of 7 days" is always shown. A missing amount counts as 0 and is reported |
| Did you know | One sentence, stable for the day, tap for another | A fact exists only above a minimum count: chai/tea 5 in 30 days, a repeated item 4, a priciest day needs 7 days of entries, "noted on N of the last M days" needs M ≥ 7 and never counts days before the first entry |
| Where it went | Last 7 days as a ranked list, icon, entries, rupees, share bar | Groups come from the same words as the row icons (`iconFor`) and the card says so. "Everything else" is always last and, when it is the biggest piece, the card says most of it is not named yet |
| When you log | Morning / afternoon / evening / night, by entry count | See below |

Under 3 entries the screen is one warm card. Under 7 entries the split is held
back. Under 15 the "when" card is held back.

## Changes the review forced

- **"When you spend" became "When you log".** Not one of the 131 real entries
  has a spoken time, so the only clock available is when each entry was *logged*,
  and people log in batches. The journal already has a rule that "logged at" must
  never be shown as "spent at" (`timeDisplay`). So the card is titled and worded
  as logging habit. Once 15 entries carry a time that was actually said, it
  switches to those alone and is retitled "When you spend".
- **Month toggle deferred.** It doubled the date edge cases and needs about two
  full months of data to compare fairly.
- **No tap-to-expand on Where it went.** The journal already lists entries.
- **Weekday fact cut.** Five weeks is five samples per weekday; one wedding makes
  it "Saturday".
- **No red or green, no arrows.** A dearer week is "₹420 more", in the same ink.

## Code

- `src/lib/insights.ts`: pure; every function takes `today`, none reads the clock.
  Dates are stepped with the Date constructor and compared as `yyyy-mm-dd` text,
  never by adding 86,400,000 ms.
- `src/app/(app)/insights/page.tsx`: the four cards. `today` is read once after
  the journal has loaded, so it cannot disagree with the server render.
- `BottomNav`: third tab.
- Tests: `scripts/journal.test.ts` (month, year and leap boundaries, gaps, a too-new
  first week, future and undated entries, null amounts, damaged records, "Everything
  else" dominating, spoken versus logged times, every fact threshold). Run under
  `TZ=Asia/Kolkata`, `America/New_York` and `Pacific/Auckland`.

## Not done

Month view, tap-to-expand groups, payment-method split (left out by choice), a
streak (it would reward logging over honesty about spending).

# Journal redesign — stub

| | |
|---|---|
| **Status** | Not started. Problem statement and open questions only |
| **Date** | 18 September 2026 |
| **Depends on** | The onboarding/auth work landing first, by explicit sequencing decision |

This is a placeholder, not a spec. It exists so the intent isn't lost between now and when this work actually starts.

---

## Why it's next

`docs/design/README.md` already flags two concrete defects in the journal that a redesign should fix:

- **The two screen headers are duplicated inline** (`src/app/page.tsx` and `src/app/journal/page.tsx`) rather than sharing a component, and they've already drifted — one writes `rounded-[9999px]`, the other `rounded-[var(--radius-pill)]` for the same visual result.
- No structural review of the journal's screen has happened since Phase A shipped it (see `docs/EXECUTION.md`, "Phase A built"). It has grown a date picker, a day-capture sheet, and a detail view since without a design pass revisiting the whole.

## Open questions to resolve before writing a real spec

- Does the journal get its own route-level layout now that `src/app/(entry)/` exists as precedent, or does it stay flat under the root layout like today?
- Should the shared header extracted here also serve the new `(entry)` screens, or do they intentionally stay visually distinct (full-bleed vs. pill-header)?
- Is month-grouping and the dark "chamber" surface still the right model once search or filtering is added, or does that surface stop scaling?

## Explicitly not decided yet

Nothing about layout, tokens, or components below the header-sharing observation above. This file gets replaced with a real spec — following the shape of `AUTH-ONBOARDING.md` — when this phase actually starts.

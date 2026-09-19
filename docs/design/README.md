# Design initiative — the interface work

**Started 18 September 2026.** This folder holds the planning for VaaniTrack's interface phase: giving the app a front door, then reworking the screens behind it.

`docs/DESIGN.md` remains the source of truth for the **shipped** design language. Everything here is a proposal until it is built. When a proposal ships, its content folds into `DESIGN.md` and the proposal doc is deleted — that way there is never a second document claiming to describe the current design.

---

## Why this phase exists

The app works and has nothing around it. It opens straight onto the capture screen with a consent modal on top: no explanation of what it is, no account, and no install path that lands anywhere sensible. Every screen that exists is a *working* screen; none of them is a *welcoming* one.

That is fine for a tool the author uses alone. It is not fine for anything shown to another person.

## The work, in order

| # | Doc | Status |
|---|---|---|
| 1 | [`AUTH-ONBOARDING.md`](AUTH-ONBOARDING.md) — onboarding flow and auth screens | **Planned, not built** |
| 2 | [`THEME-ONBOARDING.md`](THEME-ONBOARDING.md) — the visual system those screens need | **Planned, not built** |
| 3 | [`PWA-INSTALL.md`](PWA-INSTALL.md) — manifest, icons, opening on capture | **Planned, not built** |
| 4 | [`JOURNAL-REDESIGN.md`](JOURNAL-REDESIGN.md) — the next piece | **Not started — problem statement only** |

`reference/` holds the visual references these were designed against.

## Decisions already taken

| Question | Answer | Why |
|---|---|---|
| Does auth really authenticate? | **No — screens now, backend later** | There is no read-back path from the server, so an account would restore nothing. See the constraint below |
| Which screens | Onboarding **and** auth | The reference is an onboarding carousel; the ask was an auth page. Both, in sequence |
| Typography | Hybrid — Garamond for hero moments, bold Figtree for headings | EB Garamond is loaded at weight 400 only and `globals.css` says "Never bold." Bold headings are physically Figtree or nothing |
| Illustration | None — type and colour blocking | Character illustration is the most expensive part of the reference to reproduce and the easiest to get wrong. The app already owns one hand-drawn asset; use it |

## The constraint everything here is shaped around

> **Signing in must not change who the user is.**

Identity is an anonymous per-browser UUID in `localStorage` (`src/lib/device.ts`). `validDeviceId()` in `src/lib/observe.ts` rejects anything that is not a UUID, and every database writer treats a rejected id as *skip the write*.

So if a sign-in swapped the device id for a user id that was not a UUID, **every write to Postgres would stop — silently.** `/api/observe` would keep returning 200, the UI would look perfectly healthy, and the tables would simply stop filling. This codebase has been bitten by exactly this shape of bug once already: consented audio was dropped for days because a MIME parameter failed a bucket allowlist and nothing surfaced the error.

The stub auth therefore treats a session as a **UI concept only**. It never touches `vaanitrack.device`.

## Explicitly out of scope, and why

| Not doing | Reason |
|---|---|
| Real authentication | Needs a Supabase client stack; RLS is inert over the direct `DATABASE_URL` connection the app uses |
| Cross-device sync | `listTransactions()` exists in `observe.ts` with **zero callers**. The read path was written and never wired up. Sync is a build, not a wiring task |
| Anonymous → account migration | The device id was never a secret and `/api/observe` accepts any UUID from anyone, so there is no trustworthy way to prove a signing-in user owned it. Any claim flow is honour-system |
| Service worker / offline | Not needed to fix the install start screen, which is the actual ask |
| Journal redesign | Next, deliberately after this |

## Loose ends found while planning

Recorded here rather than fixed, because each is outside this phase:

- **Ember Glow has two meanings.** `DESIGN.md` reserves it for a live microphone, but `src/app/page.tsx` also uses it for error banners. One of the two has to give.
- **There is no visible focus ring anywhere.** Focus is signalled only by a border-colour swap, with `outline-none` throughout. Survivable on a three-field review card; not on a keyboard-driven auth form. This phase introduces one.
- **The two screen headers are duplicated inline**, not shared — and they have drifted: one writes `rounded-[9999px]`, the other `rounded-[var(--radius-pill)]`. A shared header component is the obvious fix and belongs with the journal redesign.

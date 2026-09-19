# Onboarding and Auth — product spec

| | |
|---|---|
| **Status** | Planned. Not built |
| **Date** | 18 September 2026 |
| **Reference** | `reference/adakita-onboarding.png` |
| **Depends on** | [`THEME-ONBOARDING.md`](THEME-ONBOARDING.md) for the visual system |

---

## 1. The problem

A first-time user opens VaaniTrack and sees a record button, a typed-entry field, and a modal asking whether their voice recordings may be kept. They are being asked to grant a microphone and consent to audio retention **before anything has told them what the app does or why it would ask.**

That ordering is the problem. The consent question is well-designed — no pre-ticked box, no default, "No" as easy to press as "Yes" — but it arrives with no context, which makes a fair question feel like an intrusion.

Separately, there is no account and no sign-in surface at all, so the app has no way to present itself as a product rather than a prototype.

## 2. What this builds

1. **A four-step first-run flow** — three explainers, then the existing consent question as a proper step with context around it.
2. **Sign-in and sign-up screens** — real routes, real states, against a stubbed backend.

## 3. What this deliberately does not build

**The account does not do anything yet.** No server session, no sync, no data moving between devices.

This is not a shortcut, it is the honest scope. Signing in on a second device today would show an **empty app, permanently** — not "empty until sync finishes." The server read path (`listTransactions()` in `src/lib/observe.ts`) has zero callers; it was written and never wired up. Until that path exists, along with merge and tombstone semantics against `localStorage`, an account cannot restore anything.

**Consequence for the design:** the auth screens must never be a gate. See §6.

## 4. First-run flow

### Shape

Four steps, full-bleed, one colour each. Progress shown as segmented bars. `Next` advances; `Skip` jumps to the consent step.

| # | Heading | Subcopy | Tint |
|---|---|---|---|
| 1 | Say what you spent | Speak it the way you'd text yourself. "250 lunch" is a whole entry. | mint |
| 2 | Check it before it's saved | Every field shows whether it was heard, worked out, or left blank. Nothing is guessed. | sage |
| 3 | Your money, in your words | The journal keeps the record readable — and correctable when it's wrong. | clay |
| 4 | *(consent — existing copy, unchanged)* | | paper |

The three explainers map to the product's three pillars: **speed**, **trust**, **the record**. They are not feature announcements; each one states a promise the app actually keeps.

### Step 4 is not a `Next` step

It keeps two equal-weight buttons, exactly as `AudioConsent.tsx` does today.

> **A `Next` button that also means "I agree" is a dark pattern.** The existing component's own comments are explicit that there is no pre-ticked box and no default, and that answering no is not a degraded mode. Wrapping that question in a carousel must not quietly reverse it.

`Skip` is offered on steps 1–3 only. **Consent is never skippable** — skipping jumps *to* it, not past it.

### Implementation shape

Built as an **overlay**, not a route — a new `src/components/Onboarding.tsx` mounted in the root layout beside the existing consent gate.

Why not a route: there is no `middleware.ts`, and `localStorage` cannot be read on the server, so a route-based flow would need a client-side redirect — which means a visible flash of the capture screen on every first load. The overlay pattern in `AudioConsent.tsx` already solves this: state starts `null`, storage is read in an effect, and the component renders nothing until it knows the answer. Server render and first client render agree, so there is no hydration mismatch and nothing flashes.

- New storage key: `vaanitrack.onboarded`
- Stacking: `z-[70]`, above the consent gate's `z-[60]`

### Sequencing with the existing gate

`AudioConsentGate` stays mounted and unchanged:

| State | What happens |
|---|---|
| Not onboarded | Onboarding runs. Its step 4 writes `vaanitrack.audioConsent` |
| Onboarded, consent unknown | The existing gate shows on its own |
| Onboarded, consent answered | Neither appears |

**No existing user is re-onboarded or asked twice.** Anyone already using the app has consent recorded, so they see nothing new.

## 5. Auth screens

### Routes

A new route group — the repo's first — so these screens get a shared shell without touching the root layout that capture and journal depend on:

```
src/app/(entry)/layout.tsx        shared full-bleed shell
src/app/(entry)/signin/page.tsx   → /signin
src/app/(entry)/signup/page.tsx   → /signup
```

### Screens and states

| Screen | Fields | States |
|---|---|---|
| Sign in | email, password | idle · inline validation · submitting · error · success |
| Sign up | email, password, confirm | idle · inline validation · submitting · error · success |

Validation is inline and on blur, not on every keystroke. Errors use the app's existing alert surface. Submitting disables the primary button using the established disabled treatment (`bg-paper-edge opacity-60 cursor-not-allowed`).

Both screens carry **"Continue without an account"** as a tertiary action.

### The stub boundary

One module, `src/lib/auth.ts`:

```ts
signIn(email, password)   signUp(email, password)
signOut()                 currentSession()
```

Backed by a local-only session in `localStorage`. Every screen imports from here and nowhere else, so swapping in Supabase Auth later is a single-file change.

**Two rules that module must obey:**

1. **It must never write `vaanitrack.device` or influence `deviceId()`.** See the constraint in [`README.md`](README.md) — a non-UUID identity silently stops every database write while the app keeps returning 200.
2. **No route may be gated on a session.** Capture and journal keep working signed out, exactly as today.

## 6. The honesty requirement

Because the account does nothing yet:

- The auth screens are **reachable**, not forced. Entry point: a header link on capture and journal, shown only when signed out.
  > **Revised during implementation.** The original plan also offered a link on onboarding's consent step. `Onboarding` mounts in the root layout and stays mounted across any route change while unfinished, so navigating to `/signin` from step 4 would leave the sign-in form hidden behind the still-mounted overlay. The alternative — finishing onboarding first, then navigating — isn't available either, since consent must stay unskippable (§4). The header link, reachable only after onboarding has actually finished, has neither problem.
- Each screen carries one quiet line saying that syncing across devices is coming and that an account does not move data yet.
- "Continue without an account" is always present and never styled as the lesser choice.

> Shipping a sign-up that appears to create an account and silently does nothing is the one genuinely bad outcome available here. Everything in this section exists to prevent it.

## 7. Acceptance criteria

**First run**
1. A browser with cleared site data shows onboarding with **no flash** of the capture screen behind it.
2. Four steps advance in order; `Skip` on steps 1–3 jumps to step 4.
3. Step 4 presents two equally weighted buttons and cannot be skipped or dismissed.
4. Answering either way writes consent, closes the flow, and reveals capture.
5. Reloading does not show onboarding again.

**Existing users**
6. With `vaanitrack.onboarded` set and consent unset, the old gate appears and onboarding does not.
7. With both set, neither appears.

**Identity — the critical one**
8. `vaanitrack.device` is byte-identical before and after a stub sign-in.
9. A capture recorded while "signed in" still writes a `captures` row under that same UUID. *A silently empty table is the failure this spec is shaped around.*

**Signed out**
10. Capture and journal are fully functional with no session present.

**Accessibility**
11. Every control in both auth forms shows a visible focus state under keyboard navigation — new behaviour for this codebase.
12. Under `prefers-reduced-motion`, step transitions do not animate.

## 8. Open questions

- **Which auth method when the backend lands** — email + password, or email OTP / magic link? OTP removes password storage, reset flows and the weakest credential entirely, and suits a phone-first app. It would change the sign-up screen, so it is worth settling before the stub is replaced rather than after.
- **Where sign-out lives.** There is no settings screen. It probably arrives with the journal redesign.
- **Whether onboarding should be re-showable** from a future settings screen. Cheap to support; no demand for it yet.

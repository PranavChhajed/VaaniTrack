# Landing page

| | |
|---|---|
| **Status** | Built. `src/app/page.tsx` |
| **Date** | 20 September 2026 |

The app had no front door on the public web. `/` was the capture screen, so a
visitor arrived inside a working tool with an onboarding carousel thrown over
the top. This is the marketing surface, and the route restructure that made
room for it.

---

## 1. The route restructure

A landing page at `/` was blocked by two things, both resolved here.

**The PWA manifest pointed at `/`.** The whole point of `PWA-INSTALL.md` was
that an install opens on capture rather than the journal. `start_url` now
points at **`/app`**, so that still holds.

**Both overlays mounted in the root layout.** `<Onboarding />` and
`<AudioConsentGate />` rendered on every route, so a first-time visitor would
have met the four-step carousel on top of the landing page.

```
src/app/
  page.tsx                landing        →  /          no overlays
  (app)/
    layout.tsx            mounts Onboarding + AudioConsentGate
    app/page.tsx          capture        →  /app
    journal/page.tsx      journal        →  /journal   URL unchanged
  (entry)/                signin, signup            unchanged
```

Route groups do not affect URLs, so only capture moved. Everything that linked
to capture now links to `/app`: the journal's three entry points, both auth
screens' "Continue without an account" and post-submit redirects, and `/diag`.

The `(entry)` layout's wordmark still points at `/`, deliberately: it is a
brand mark, and from a half-finished signup the landing page is the right
destination.

### A side effect worth recording

`AUTH-ONBOARDING.md` carries a note explaining that the onboarding step-4
sign-in link had to be **dropped**, because `Onboarding` persisted across
client-side navigation and would cover `/signin`. Scoping the overlays to
`(app)` removes that blocker at its source. Restoring that entry point was out
of scope here, but it is no longer impossible.

## 2. What this page may not claim

This is the binding part of this document. The product's own governing rule is
*never record a wrong transaction*; a landing page that overstates would be the
same failure in a different medium.

`PRD-VaaniTrack.md:628` is explicit: **"None of these may be presented as
established facts"**, covering whether voice improves retention, whether users
trust an AI with financial data, and whether the system is accurate enough.

| Never say | Why |
|---|---|
| Any percentage as **our** result | Every figure in `RESEARCH.md` is an external benchmark. Our only own accuracy data is a 14-row eyeballed table in `EXECUTION.md`, with no computed rate. The 120-case corpus has never been run |
| "on-device", "offline", "nothing leaves your phone" | Audio is posted to a hosted API. `PRD-VaaniTrack.md:568` explicitly disowns its own privacy claim on this point |
| "Recordings are deleted after 90 days" | `CONTEXT.md:618`: nothing reads `audio_expires_at`. No purge job exists. It is already an unkept in-app promise and must not become a public one |
| "Nothing saves until you've looked at it" | False. Confident captures auto-save, with undo. `README.md:8` is wrong and contradicted later in its own file |
| Any account or sync benefit | `AUTH-ONBOARDING.md:118`: a sign-up that appears to create an account and silently does nothing "is the one genuinely bad outcome available here" |
| Anything from `IQOO-HACKATHON.md` | Bank-SMS reconciliation, Tamil, udhaar, camera capture. None exists here, and the SMS parts are impossible for a web app |

**The one number on the page** is the 36.3% currency-amount figure from
*Handling Numeric Expressions in ASR* (arXiv:2408.00004). It is used to frame
why the two-stage design exists, and the page says in plain words that it is
"an external benchmark of general transcription, not a measurement of
VaaniTrack." That attribution is part of the design and is not fine print to be
trimmed later.

## 3. Sections

**Redesigned 20 September 2026.** The page told its own story three times
over — a headline, a static "the problem" illustration, and a three-pillar
grid — before a visitor had done anything. Replaced with one felt
demonstration in the hero and a shorter page around it.

| # | Section | Doing what |
|---|---|---|
| 1 | Hero | The live tagline, `HeroDemo` (see §5), the WhatsApp-to-self origin line, and the primary CTA |
| 2 | How it works | The three shipped pillars, with the `OnboardingArt.tsx` illustrations reused |
| 3 | Why it's built this way | The dark chamber. The 36.3% figure and the two-stage answer to it |
| 4 | What it doesn't do yet, and the closing CTA | No sync, English only, deliberately small — then "Open the app" directly beneath, no second heading between them |

The standalone "problem" section (a static form-vs-speech illustration,
`FrictionArt`) is gone; the hero's demo now shows that contrast rather than
describing it, and `FrictionArt`'s export was deleted from `OnboardingArt.tsx`
since nothing calls it. Sections 2 through 4 animate in on scroll via
`Reveal.tsx`; see §5.

**The CTA is "Open the app", never "Install".** There is no service worker
(`CONTEXT.md:674`), so an install button would promise something that does not
exist. Installing still works through the browser's own menu.

Section 4's limits list is the page's credibility rather than its apology,
and is typeset with the same care as everything else. It takes its voice
from the consent dialog's *"You can say no and everything still works."*

## 4. Visual system

One new pair of utilities, `.reveal`/`.reveal-visible` (§5); otherwise this
is `globals.css` as it already stood: the `max-w-[900px]` page shell and
`gap-16 sm:gap-24` rhythm from the capture screen, the dark chamber from the
journal for section 3, Garamond `.display-type` for headings, Figtree for
body, the mint pill for CTAs, `.focus-ring` on every interactive element,
and `.rise` for the hero, all of it already covered by the
`prefers-reduced-motion` block.

The page is a **server component**. It holds no state and reads no storage, so
there is nothing to hydrate.

## 5. Motion

Two client components, both islands: everything they wrap still renders
fully server-side first, so a request with no JS gets the complete page,
just without the motion.

**`HeroDemo.tsx`** is the hero's centerpiece: an auto-playing, tap-to-replay
sequence (idle → listening → heard → settled) showing the whole product
loop — "250 lunch" settling into a checked ₹250 · Lunch · Today row — in
about three seconds, reusing `.wave-bar` from `WaveformButton.tsx` rather
than inventing a second waveform. Only "Today" carries the `.prov-inferred`
mark; the amount and category were both actually said in the example
phrase, so they render in plain ink. Checked against §2: this is visibly an
illustrative example, the same way `ReceiptArt` already shows an unlabeled
generic row, not a claimed result. Under `prefers-reduced-motion`, it skips
straight to the settled state with no timers.

**`Reveal.tsx`** wraps sections 2 through 4 so they fade and rise into place
as they're scrolled into view, rather than the page moving only once, on
load. It never hides content from a request that can't run its effect: the
server-rendered and first client render carry no hidden styling at all, and
the pending (hidden) state is only ever added client-side, before the
browser's first paint, for an element that starts below the fold with motion
allowed.

## 6. Still open

- **No deployment.** The repo is private and nothing is deployed, so the page
  has no public URL yet.
- **The logo.** A new mark was supplied and is being adopted; this page uses
  whatever `Logo.tsx` exports, so it picks that up automatically.
- **Restoring onboarding's sign-in entry point**, now unblocked by the `(app)`
  group.

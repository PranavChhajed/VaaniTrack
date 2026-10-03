# Theme extension — onboarding and auth

| | |
|---|---|
| **Status** | Planned. Extends `docs/DESIGN.md`; fold in and delete this file once built |
| **Date** | 18 September 2026 |
| **Reference** | `reference/adakita-onboarding.png` — full-bleed pastel colour blocks, bold headings, black pill buttons, segmented progress, `Next`/`Skip` |

This is not a new design language. It is the smallest extension to the existing one that can carry a first-run flow and two auth screens without reading as a different product.

---

## 1. What the reference gets right, and the one thing VaaniTrack cannot take

**Right, and worth keeping:** full-bleed colour per screen, one bold claim per screen instead of a paragraph, a black pill button that reads as the single obvious action, and a progress indicator that tells the user how much is left.

**Cannot take: the lavender.** `globals.css:12-14` records a deliberate rotation — the app's primary action moved *lavender → mint* specifically because mint is a tonal sibling of Forest Ink and "reads as money rather than dictation." Reintroducing lavender here would quietly undo that decision on the very first screen a new user sees.

**So: take the grammar, not the palette.** New screens use VaaniTrack's own family.

## 2. Colour — one new tint

```css
--color-tint-mint: #cfead9;  /* = existing --color-mint-whisper. Screen 1 */
--color-tint-sage: #dbe7dc;  /* cooler, greener. Screen 2 */
```

Screen 3, screen 4 (consent), and both auth screens use `--color-paper` (`#f0ede7`) unchanged — no new tint needed, since consent and auth are continuous with the app rather than a pitch for it.

**Revised during implementation:** a third tint, `--color-tint-clay` (`#eaded1`), was built and shipped for screen 3, specified as "warm sand." Reviewed against the shipped mint and sage, it read as dusty pink rather than sand, the one colour in the app belonging to no existing family. It was deleted rather than re-tuned. Screen 3 now lands on `--color-paper` a step early.

**The progression is deliberate:** mint → sage → paper walks the user's eye toward the actual canvas colour, so arriving at the capture screen feels like reaching a destination rather than being dropped somewhere new, and consent already feels like it is happening inside the app rather than inside a pitch for it.

**Ember Glow (`--color-ember-glow`) is off-limits here.** `DESIGN.md` reserves it for one meaning — the microphone is live — and onboarding never records audio. (Aside, logged in `docs/design/README.md`: the shipped app already breaks this rule once, using Ember Glow for error banners on the capture screen. Not this phase's problem, but worth fixing when noticed.)

## 3. Type

**`.display-type` cannot go bold.** It is EB Garamond, loaded at weight `400` only (`layout.tsx`), and the CSS comment states outright: *"Never bold."* The reference's headings are heavy. Those two facts can't be reconciled by leaning on Garamond harder.

**Resolution — hybrid, as decided:**

| Use | Face | Weight |
|---|---|---|
| Screen headings (the bold claim) | Figtree | 700 |
| Subcopy | Figtree | 400, `text-fog` |
| The wordmark, and the app's own name inside the flow | EB Garamond | 400 (`.display-type`, its only weight) |

Garamond appears **once per screen at most** — enough to tie the flow to the app it opens into, not so much that it fights the reference's directness.

**Sizes**, reusing the existing scale rather than inventing new steps: `text-heading-sm` (32px) on mobile, `sm:text-heading` (48px) up. Subcopy at `text-body` (20px).

## 4. Layout grammar

One shape, four fills:

```
┌─────────────────────────────────┐
│ ● ● ○ ○           (progress)     │  segmented, active = vast-ink,
│                                   │  rest = vast-ink/20
│                                   │
│         Heading, 2–4 lines       │  Figtree 700
│         Subcopy line              │  Figtree 400, fog
│                                   │
│         ⌇⌇⌇  (drawn rule)         │  see §5
│                                   │
├─────────────────────────────────┤
│  ⬛  Next  (full-width pill)      │  black, not mint — see §6
│      Skip                        │  text button, centred
└─────────────────────────────────┘
```

`min-h-dvh`, flex column, content vertically centred in the middle band. This is the same skeleton on all four onboarding screens; only the tint, heading, subcopy and progress state change.

## 5. The drawn element — no character illustrations

The reference spends most of its visual weight on a custom hand-drawn character per screen. That is the single most expensive thing to reproduce well, and a mediocre version would read worse than nothing.

**First attempt: reuse the app's own hand-drawn asset.** `globals.css` ships one piece of line art, the SVG stroke behind `.prov-inferred`, the underline that marks a value the app worked out rather than heard. Scaled up as a horizontal section rule between the copy and the footer, the idea was to give the screen warmth without inventing a new visual language.

**Revised during implementation: it read as too thin, as this document already anticipated.** A 6px squiggle repeated identically on all three screens was decoration that read as an accident, not a composition. Replaced with three small hand-drawn illustrations (`src/components/OnboardingArt.tsx`), one per screen, in the same monoline ink language as the logo: sound leaving a mouth, a receipt being checked (its middle row still carries the exact `.prov-inferred` squiggle, now placed where checking is actually explained), and a stacked ledger. No characters, no fills beyond the receipt's own paper colour. The illustration is now the screen's focal element, given the layout's `flex-1` band; `Next` moved to a full-width pill and `Skip` moved into the header so the footer holds one action.

## 6. Buttons and inputs — reuse existing strings exactly

The reference's primary button is black. VaaniTrack's primary is mint. **This extension keeps VaaniTrack's**, both because consistency with the rest of the app matters more than matching the reference exactly, and because introducing a second "primary" colour (black) alongside mint would split the button language the app already has.

Copy these strings verbatim — do not re-derive:

```
Primary   rounded-[var(--radius-button)] border-2 border-vast-ink bg-mint-whisper
          px-5 py-3 font-figtree text-body-sm font-medium text-vast-ink
          active:bg-mint-deep
          (AudioConsent.tsx:69)

Tertiary  font-figtree text-body-sm text-fog underline underline-offset-4
          hover:text-vast-ink
          (ReviewCard.tsx:250)

Input     w-full rounded-[12px] border-2 border-vast-ink bg-paper px-4 py-3
          font-figtree text-body-sm text-vast-ink outline-none
          focus:border-forest-ink
          (ReviewCard.tsx:76 — the shared `inputClass` constant; import it,
          don't retype it)
```

**Radii are consumed as arbitrary values, not utility names.** The tokens exist in `@theme` as `--radius-button` etc., but every component uses `rounded-[var(--radius-button)]`, never a generated `rounded-button` class. This is the detail most likely to be gotten wrong by habit.

## 7. New: a visible focus ring

**The app currently has none.** Every focusable element uses `outline-none` and signals focus only by swapping the border colour to `forest-ink`. That is tolerable on a three-field review card glanced at once; it is not tolerable on a form a keyboard user is expected to complete.

Add one rule to `globals.css`, applied to every new interactive element in this phase (inputs, both button classes):

```css
--color scheme unchanged; add a focus-visible ring using the existing palette,
not a new colour: 2px offset ring in forest-ink, respecting the app's
"only two ink weights, never a shadow" rule by using an outline rather
than a box-shadow.
```

The exact CSS is an implementation detail for the build step; the requirement is binding: **every new focusable element must have a focus-visible state distinct from its resting and hover states.**

## 8. Motion

Reuse what exists — no new animation vocabulary:

| Class | Use here |
|---|---|
| `.rise` | Each step's heading/subcopy entering |
| `.sheet-rise` | If a step transition is a slide rather than a cut |
| `prefers-reduced-motion` | Already globally handled in `globals.css`; new elements must not bypass it |

## 9. What folds into `DESIGN.md` when this ships

Once built: the three tint tokens, the focus-ring rule, and a short "onboarding and auth" section describing the layout grammar. This file is then deleted — `DESIGN.md` should never have two documents both claiming to describe the current system.

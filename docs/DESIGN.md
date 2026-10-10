# VaaniTrack — Design Language

**What the app actually looks like, and why.** Written 18 September 2026 against `src/app/globals.css`, which is the authoritative source — if this file and the CSS disagree, the CSS is right.

The visual structure was borrowed from an outside reference (`WISPR-FLOW-REFERENCE.md`): 2px ink borders, no shadows anywhere, oversized radii, alternating light and dark chambers, a Garamond display face over a Figtree UI face. Three deliberate departures from that reference are recorded below, because each one was a decision rather than a drift.

---

## 1. The one idea

> **A financial record should look like a financial record.**

Not a chat app, not a dashboard. The amount is the thing the user came to check, so it is set in a serif at tabular width and given more weight than anything around it. Everything else — category, payment method, time — is support.

The second idea follows from the first: **the interface must be able to show that it is unsure.** Provenance styling (§5) exists so a value the app worked out never looks identical to a value the user said.

---

## 2. Colour

```css
--color-mint-whisper: #cfead9   /* primary action fill */
--color-mint-deep:    #aeddc6   /* its pressed/active sibling */
--color-forest-ink:   #034f46   /* inner accents, the underline stroke */
--color-ember-glow:   #ffa946   /* live state — recording and warming only */
--color-vast-ink:     #1a1a1a   /* dark chambers, primary text */
--color-paper:        #f0ede7   /* the canvas */
--color-paper-raised: #f9f7f3   /* cards — depth by value, never by shadow */
--color-paper-edge:   #ddd7cb   /* hairlines and dividers */
--color-fog:          #8a857c   /* secondary text, defaulted values */
--color-charcoal:     #222222
--color-pure-white:   #ffffff
```

**The three departures from the reference**, quoted in intent from `globals.css`:

1. **Canvas moved off the reference's yellow cream (`#ffffeb`) to an oat paper.** Still warm, still light, off the yellow axis.
2. **The primary action rotated lavender → mint.** This makes it a tonal *sibling* of Forest Ink rather than its complement — it reads as money rather than as dictation. This is the single most meaningful colour decision in the app.
3. **A raised paper surface was added** so cards separate from the canvas by value as well as by border. Depth without ever reaching for a shadow.

`--color-fog` was also warmed from the reference's `#8a8a80` to sit correctly on the oat canvas.

**Ember Glow is reserved.** It means the microphone is live — `warming` or `recording`, nothing else. Spending it on any other accent would cost the one colour that means "we are listening to you right now."

## 3. Type

Two families. **EB Garamond** (`--font-garamond`) for display and for money. **Figtree** (`--font-figtree`) for every interactive and UI surface.

| Token | Size | Notes |
|---|---|---|
| `--text-caption` | 14px | Metadata, provenance labels |
| `--text-body-sm` | 16px | Secondary row content |
| `--text-body` | 20px | Default |
| `--text-subheading` | 24px | |
| `--text-heading-sm` | 32px | Screen titles; `-0.96px` tracking |
| `--text-heading` | 48px | `0.95` line height |
| `--text-heading-lg` | 64px | `-1.92px` tracking |

Line heights sit at `1.3` up to subheading, then tighten to `0.95` at heading sizes, where generous leading would read as loose rather than airy.

**The `.money` class is load-bearing.** Garamond, weight 400, with `tabular-nums lining-nums`. Tabular figures mean a column of amounts stacks the way it would in an account book — ₹1,250 sits directly over ₹250 instead of drifting. This is why amounts are not simply bolded body text.

## 4. Shape and depth

```css
--radius-input: 12px    --radius-card:        32px
--radius-button: 12px   --radius-chamber:     40px
--radius-tag: 8px       --radius-chamber-lg:  80px
                        --radius-pill:        9999px
```

The rule behind the numbers: **never below 12px on a button, never below 32px on a card.**

**The app is deliberately shadowless.** Separation comes from three things only — a 2px ink border, a value step between `--color-paper` and `--color-paper-raised`, and the hairline `--color-paper-edge`. Adding a box-shadow anywhere breaks the system.

## 5. Provenance styling — the part that carries the product

FR-10 made visible. Four states, and the design has to distinguish them at a glance:

| Provenance | Treatment |
|---|---|
| `said` | Plain ink, no marker. The user said it; nothing to flag |
| `inferred` | **Hand-drawn underline** (`.prov-inferred`) — an inline SVG stroke in Forest Ink |
| `default` | Fog. Present, correct, but supplied by the app |
| `unknown` | **Dashed fog outline** (`.prov-unknown`), and no value invented |

The underline is the reference's editorial-emphasis accent, repurposed: **decoration turned into data honesty.** It was meant to emphasise words in a marketing headline; here it marks a value the app worked out rather than heard.

`unknown` is the state most designs would suppress. It is rendered plainly, because a blank the user can see is the honest outcome and hiding it would be the one thing this product must not do.

## 6. Motion

| Class | Motion | Used for |
|---|---|---|
| `.rise` | 8px up, 240ms | Banners, toasts — a nudge |
| `.sheet-rise` | Full height, 260ms, `cubic-bezier(0.32, 0.72, 0, 1)` | Sheets and modals |
| `.veil-in` | Opacity, 200ms | The scrim behind a sheet |
| `.wave-bar` | `scaleY` pulse, 900ms, infinite | Live recording bars |

A sheet travels the height of *itself*, not the 8px a banner gets, so it reads as arriving from off-screen rather than fading into place.

**`prefers-reduced-motion` is honoured**: every animation above is disabled, and the waveform bars settle at `scaleY(0.7)` rather than freezing at an arbitrary point in their cycle.

## 7. The record button — four states, three labels

`WaveformButton` is the app's single primary control. The reference treated a waveform as inline decoration; here it is **promoted from decoration to the primary action**.

| State | Label | Treatment |
|---|---|---|
| `idle` | "Say what you spent" | `mint-whisper` |
| `requesting` | *(label held)* | Disabled, 60% opacity, `cursor-not-allowed` |
| `warming` | **"Getting the mic ready…"** | `ember-glow`, 80% opacity, `cursor-wait` |
| `recording` | **"Tap to finish"** | `ember-glow`, bars pulsing |

**The `warming` state is not cosmetic, and it is the newest thing in this system.** Some handsets deliver digital silence for up to 1.4 seconds after granting microphone access. The button used to say "Tap to finish" immediately, so the opening words — usually the amount — were spoken into a dead stream. The button now withholds that invitation until the level meter confirms sound is arriving. **"Tap to finish" appears only on `recording`, never on `warming`** — that distinction is the entire point, and it must survive any redesign of this control.

## 8. The components

| Component | Role |
|---|---|
| `WaveformButton` | The primary control. See §7 |
| `ReviewCard` | "Check this before it's saved" — shows uncertain fields with provenance, editable in place |
| `TransactionList` | Today's spending, rendered as a dark chamber |
| `TransactionRow` | Built for scanning. Falls back to payee as the primary label when there is no description. Starts with an `ExpenseIcon` |
| `ExpenseIcon` | A line icon on a forest tile, chosen from the row's words by `lib/icon.ts`. A picture only: it is never written to the category. Line art, not emoji, so it is the same drawing on every phone |
| `ProfileLink` | The profile icon in the header (the person's initial, or a plain figure): the way to the You screen. Replaces the in-app "Sign in" link |
| `BottomNav` | The two tabs, Capture and Journal, fixed under the thumb. Mounted once in `(app)/layout.tsx`; sits below the sheets |
| `TransactionDetail` | Full record with provenance, edit and delete |
| `DatePicker` | Month grid, always open in the journal; each populated day carries its total, future days are disabled |
| `DayCapture` | The sheet that records onto a chosen past day |
| `AudioConsent` | The one question, asked once, before any recording. Mounted in the root layout |
| `PortalLogin` | Password form for `/portal` |

**Provenance belongs in the detail view, not on the row.** On a row it is noise; on the detail it answers the question a financial record has to answer.

## 9. What is outside this system

`/portal`, `/diag` and `/diag/mic` are **developer-facing diagnostic surfaces** and deliberately do not follow the above. They are dense, table-heavy and optimised for reading many rows quickly. They are tools, not product, and holding them to the design language would make them worse at their job.

---

## If you change the design, preserve these

1. **No shadows.** Depth is border, value step, and hairline. Nothing else.
2. **Ember Glow means the microphone is live.** Do not spend it elsewhere.
3. **Amounts stay tabular.** A column of money must align on the decimal.
4. **Never style `inferred` and `said` the same.** The provenance system is the product's honesty made visible.
5. **`unknown` renders as a visible blank.** Never hide it, never fill it.
6. **"Tap to finish" must not appear until the microphone is actually live.**
7. **`prefers-reduced-motion` stays honoured** — including the waveform's resting state.

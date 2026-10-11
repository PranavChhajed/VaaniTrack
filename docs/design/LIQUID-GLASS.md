# The liquid-glass bottom bar

> **Superseded on 11 October.** The glass bar was built and measured, and then
> taken out: `DESIGN.md` §4 says the app is deliberately shadowless (separation
> only by a 2px ink border, a paper value step and hairlines), and frosted glass
> breaks that rule on every count. The weakest part was also the "you are here"
> cue, a brighter pane of glass on glass. The bar is back to raised paper in an
> ink border, with a **solid ink pill under the current tab** that slides with the
> same small overshoot. This file is kept for what it measured, not for what
> ships. Checked by `qa/nav.cjs`.


`src/components/BottomNav.tsx`, styled by `.glass-bar` and `.glass-lens` in
`src/app/globals.css`.

## What it is

A floating pill of frosted glass that the page shows through, with the cues that
make glass look like glass instead of a see-through box:

| Cue | How |
|---|---|
| Frost | `backdrop-filter: blur(24px) saturate(190%) brightness(1.04)` |
| Light catching the top edge | a 1.5px bright inset line along the top |
| Thickness | a soft inner glow just inside the rim |
| Sheen | a faint diagonal highlight (`::before`) |
| Lift | two layered drop shadows |
| The selected tab | a second, brighter pane (the **lens**) that slides to the new tab with a small overshoot, like a droplet settling |

Every tab is the same width, so the lens moves by whole multiples of its own
width (`translateX(index * 100%)`) and nothing is measured. On a screen that is
not a tab (You) the lens fades out and no tab is marked current.

## Decisions

- **No real refraction.** The effect that bends what is behind the glass needs
  an SVG filter applied to the backdrop, which only Chromium honours. It would
  look different on every phone, so it is not used. This is the same look
  without the bending.
- **Text stays ink, over a tint that is never thin.** Ink on a see-through bar
  is unreadable over the dark Today panel unless the glass carries enough white.
  The gradient runs 58% to 30% white over a 34% paper wash.
- **Falls back, not breaks.** Without `backdrop-filter`, or with the system
  setting "reduce transparency", the bar becomes solid paper with the same shape
  and lens. With "reduce motion" the lens jumps instead of travelling.

## Measured, not assumed

Ink text on the empty glass between the tabs, sampled from real screenshots:

| Behind the bar | Safari's engine | Chrome's engine | Needs |
|---|---|---|---|
| the dark Today panel | 6.8 : 1 | 5.8 : 1 | 4.5 : 1 |
| paper | 15.8 : 1 | 12.5 : 1 | 4.5 : 1 |

The bar is 350 x 58 on an iPhone 14, and every tab is 113 x 48, above the 44pt
touch size. The automated check is `qa/glass.cjs`.

## Found while testing it

- **Save was under the bar.** A review card for an unsure expense is taller than
  the space above the bar on a phone, and the buttons that finish it sat
  underneath. They now stick just above the bar for as long as the card is on
  screen (`ReviewCard.tsx`).

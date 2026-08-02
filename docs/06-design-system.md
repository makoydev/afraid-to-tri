# 06 — Design System

Mobile-first, thumb-first, sweat-proof. Every rule here exists because of a real use context: a phone held one-handed on a bike, a wet screen on a pool deck, a dark early-morning run.

---

## Design tenets

1. **One primary action per screen**, always in the thumb zone.
2. **Legible while moving.** Nothing critical below 16 px; live-workout text far larger.
3. **Never colour alone.** Every colour-coded state carries an icon, a label, or a shape.
4. **Calm by default, loud when it matters.** Colour is used sparingly so that the one thing that needs attention actually gets it.
5. **Motion clarifies, never decorates.** All motion respects `prefers-reduced-motion`.

---

## Layout

### Breakpoints

| Name   | Width    | Layout                                                              |
| ------ | -------- | ------------------------------------------------------------------- |
| `base` | 320–479  | Single column. The design target.                                   |
| `sm`   | 480–767  | Single column, more generous spacing                                |
| `md`   | 768–1023 | Two columns on Calendar/Progress; nav moves to a rail               |
| `lg`   | 1024+    | Max content width 1100 px, centred. Never a bespoke desktop layout. |

Everything is designed at **360 px** first. If it doesn't work there, it doesn't ship.

### Vertical zones

```
┌────────────────────────────┐
│ safe-area-inset-top        │
├────────────────────────────┤
│ Header  (56px, sticky)     │  ← identity, settings. Never actions.
├────────────────────────────┤
│                            │
│ Content (scrollable)       │  ← information, secondary actions
│                            │
├────────────────────────────┤
│ Primary action zone        │  ← the one thing you came here to do
│ (bottom 33% of viewport)   │
├────────────────────────────┤
│ Bottom nav (64px)          │  Today · Calendar · Progress · Me
├────────────────────────────┤
│ safe-area-inset-bottom     │
└────────────────────────────┘
```

- Bottom nav uses `env(safe-area-inset-bottom)`; it is hidden entirely in live-workout and race modes.
- Sticky headers collapse on scroll to return vertical space.
- **Nothing interactive within 8 px of the viewport edge** (accidental-touch and gesture-conflict zone).

### Touch targets

| Context        | Minimum                                    |
| -------------- | ------------------------------------------ |
| Standard       | 44 × 44 px                                 |
| Primary action | 56 px tall, full-width minus 16 px gutters |
| Live workout   | **64 × 64 px**, 12 px minimum spacing      |
| Destructive    | 44 px + confirmation step                  |

---

## Tokens

Defined as CSS custom properties on `:root`, consumed by Tailwind via `theme.extend`. Dark values are declared under both `@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]`, so the in-app toggle wins in both directions.

### Spacing

4 px base scale: `0, 1(4), 2(8), 3(12), 4(16), 5(20), 6(24), 8(32), 10(40), 12(48), 16(64)`.
Screen gutter is `4` (16 px). Card padding `4`. Section gap `6`.

### Radius

`sm 8px` (chips, inputs) · `md 12px` (cards) · `lg 20px` (hero card, sheets) · `full` (pills, avatars).

### Typography

System sans throughout: `system-ui, -apple-system, "Segoe UI", sans-serif`. No display face, no icon font.

| Token      | Size / line-height | Weight | Use                                                 |
| ---------- | ------------------ | ------ | --------------------------------------------------- |
| `display`  | 48 / 52            | 700    | Live-workout countdown, hero numbers                |
| `title-lg` | 28 / 34            | 700    | Screen titles                                       |
| `title`    | 22 / 28            | 600    | Card titles                                         |
| `body-lg`  | 18 / 26            | 400    | Workout purpose, module body                        |
| `body`     | 16 / 24            | 400    | Default                                             |
| `label`    | 14 / 20            | 500    | Metadata, form labels                               |
| `caption`  | 13 / 18            | 500    | Timestamps, footnotes. **Floor — nothing smaller.** |

`font-variant-numeric: tabular-nums` on anything that counts or aligns (timers, splits, table columns). Hero numbers use proportional figures.

### Elevation

Two levels only. `card`: `0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.04)`. `sheet`: `0 -4px 24px rgba(0,0,0,.12)`. Dark mode substitutes a 1 px hairline border for the shadow — shadows are invisible on dark surfaces.

---

## Colour

Palette validated with the data-viz six-checks in both modes (see [Charts](#charts)). The same hues serve UI and charts so the product reads as one system.

### Surfaces & ink

| Role            | Light     | Dark      |
| --------------- | --------- | --------- |
| Page plane      | `#f9f9f7` | `#0d0d0d` |
| Surface (cards) | `#fcfcfb` | `#1a1a19` |
| Surface raised  | `#ffffff` | `#232322` |
| Primary ink     | `#0b0b0b` | `#ffffff` |
| Secondary ink   | `#52514e` | `#c3c2b7` |
| Muted ink       | `#898781` | `#898781` |
| Hairline        | `#e1e0d9` | `#2c2c2a` |

### Brand

| Role              | Light     | Dark      |
| ----------------- | --------- | --------- |
| Primary (actions) | `#4a3aa7` | `#9085e9` |
| Primary ink-on    | `#ffffff` | `#12121a` |
| Primary wash      | `#eeecfa` | `#241f42` |

Violet is deliberately _not_ one of the discipline hues, so a primary button never reads as "this is a swim thing".

### Discipline colours

Identity colours, used on icons, calendar dots, and chart series. **Always paired with an icon and a label** — never colour alone.

| Discipline       | Light               | Dark      | Icon     |
| ---------------- | ------------------- | --------- | -------- |
| Swim             | `#2a78d6`           | `#3987e5` | 🏊 wave  |
| Bike             | `#eb6834`           | `#d95926` | 🚴 wheel |
| Run              | `#1baf7a`           | `#199e70` | 🏃 shoe  |
| Brick            | gradient bike → run | —         | linked   |
| Strength / other | `#898781` (muted)   | `#898781` | dumbbell |
| Rest             | surface + hairline  | —         | moon     |

Validator result (all-pairs, both modes): CVD ΔE 9.2 light / 9.4 dark, normal-vision ΔE 24.0 / 20.9 — clear of both floors. On the light surface, run-aqua sits at 2.74:1 contrast, which triggers the **relief rule**: wherever it's used as a fill, a visible label or the table view must accompany it. That's already guaranteed by the icon+label rule above.

Strength and rest use neutrals on purpose — the three race disciplines own all the hue in this app.

### Intensity zones

Zones are **ordered magnitude**, not identity, so they use a single-hue ordinal ramp — never a red-amber-green rainbow, which would imply "green good, red bad" about intensity that is neither.

| Zone        | Light     | Dark      |
| ----------- | --------- | --------- |
| 1 Recovery  | `#86b6ef` | `#184f95` |
| 2 Easy      | `#5598e7` | `#256abf` |
| 3 Steady    | `#2a78d6` | `#3987e5` |
| 4 Hard      | `#1c5cab` | `#6da7ec` |
| 5 Very hard | `#104281` | `#9ec5f4` |

Light-mode steps stop at 250 (≥ 2:1 vs surface); dark-mode steps stop at 600. Zone bars are always accompanied by the zone number and its word.

### Status

Fixed, never themed, never reused as a series colour. Always shipped with an icon and a label.

| Role     | Hex       | Used for                               |
| -------- | --------- | -------------------------------------- |
| good     | `#0ca30c` | Completed, in-zone, synced             |
| warning  | `#fab219` | Attention needed, ramp near cap        |
| serious  | `#ec835a` | Missed sessions, sync backlog          |
| critical | `#d03b3b` | Pain flagged, illness, plan infeasible |

**Red is reserved.** A missed session is `serious`, not `critical` — it is not an emergency, and the UI must never imply that it is. See [Emotional design](#emotional-design).

### Completion states

| State                | Treatment                                          |
| -------------------- | -------------------------------------------------- |
| Completed            | Filled discipline colour + ✓                       |
| Today                | Ring in primary, filled dot                        |
| Planned              | Outline in discipline colour                       |
| Missed               | Muted outline + small dash. Never red, never an X. |
| Skipped (deliberate) | Muted fill + reason chip                           |
| Rest                 | Hairline circle, no fill                           |

---

## Components

Built on Radix primitives; each lives in `components/ui/` with a story and an a11y test.

### Button

Variants: `primary` (filled brand) · `secondary` (surface + hairline) · `ghost` (text only) · `destructive`.
Sizes: `sm 36` · `md 44` · `lg 56` · `xl 64` (live workout).
Every button has a loading state that preserves width (no layout shift) and a disabled state with a reason available on long-press.

### Card

`md` radius, `card` elevation, 16 px padding. Composable header/body/footer. Tappable cards get an active-scale of 0.98 and a focus ring.

### HeroSessionCard

The Today screen centrepiece. Discipline stripe down the left edge, title, duration chip, zone chip, purpose text, `lg` primary button, and two ghost links (`Details`, `Not today`).

### DayStrip

Seven tappable day cells: weekday letter, discipline icon, completion state. Today has a filled ring. Horizontally scroll-free at 360 px.

### Sheet (bottom sheet)

The primary disclosure pattern on mobile — used for alternatives, skip reasons, glossary definitions, filters. Drag-to-dismiss, focus trap, `Esc` support, `aria-modal`.

### ZoneChip / DisciplineChip / JargonChip

`JargonChip` is the mechanism behind Principle 3: any domain term renders as a subtly-underlined inline chip that opens a glossary sheet on tap. Content authors write `<Jargon term="brick">brick</Jargon>` in MDX and it just works.

### StepTimer

Live-workout core. Countdown ring (SVG `stroke-dasharray`), giant remaining time, step label, target zone with plain-language cue, next-step preview. Ring animates via CSS transform only — no per-frame JS, so it survives background throttling.

### RpeSelector

Five faces mapping to RPE bands, 64 px targets, labelled beneath. Selection is a single tap with no confirm step.

### PlanChangeNote

Dismissible inline card: what changed, why, and an Undo. Appears at most once per day.

### StatTile

Label · value · optional delta · optional sparkline. Value uses `display` or `title-lg`, label in muted ink above. Deltas carry an arrow **and** a sign (never colour alone), with good/critical status colours.

### EmptyState

Icon, one-line explanation of what will appear here, and — where relevant — what unlocks it. Never a bare "No data".

---

## Charts

Charts appear only on Progress and in the session detail. They follow the data-viz method: form first, colour last, validated palette, hover layer, table fallback.

| What                          | Form                            | Notes                                                                                                                                               |
| ----------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Weekly volume by discipline   | Stacked bars, one per week      | Discipline colours, 2 px surface gap between segments, legend always present                                                                        |
| Fitness / Fatigue / Freshness | Two lines + a diverging area    | Single y-axis in Load Units. Fitness `#2a78d6`, Fatigue `#eb6834`, Freshness area diverging blue↔red about a gray zero line. **Never a dual axis.** |
| Easy-pace trend               | Single line, 2 px               | One series → no legend; the title names it                                                                                                          |
| Session HR/pace over time     | Area with zone bands behind     | Zone bands from the ordinal ramp                                                                                                                    |
| Consistency                   | Stat tiles + a 12-week dot grid | The beginner-facing view; leads the page                                                                                                            |

Rules that apply to every chart here:

- **One y-axis. Ever.** Two measures of different scale become two charts.
- ≥ 2 series → legend always; ≤ 4 series also get direct labels.
- Every chart carries a one-sentence plain-English reading beneath it.
- Every chart has a table view behind a "View as table" toggle — this is also the relief mechanism for the sub-3:1 light-mode aqua.
- Charts don't render at all below their data threshold; an `EmptyState` explains what unlocks them.
- Grid and axes are recessive (hairline, muted ink). Data is the only thing with weight.

---

## Motion

| Interaction       | Motion                         | Duration          |
| ----------------- | ------------------------------ | ----------------- |
| Screen transition | Slide + fade                   | 220 ms `ease-out` |
| Sheet             | Slide up, spring               | 280 ms            |
| Card tap          | Scale to 0.98                  | 100 ms            |
| Countdown ring    | Linear stroke                  | Continuous        |
| Completion        | Checkmark draw + subtle haptic | 400 ms            |
| Milestone         | Confetti burst                 | 1200 ms, once     |

`prefers-reduced-motion: reduce` disables all transforms and confetti, keeping opacity fades only. The countdown ring becomes a numeric-only display.

Haptics (where supported): light on selection, medium on step change, success pattern on session complete. Never on errors — buzzing at someone who missed a workout is exactly wrong.

---

## Accessibility

Target: **WCAG 2.2 AA**, with AAA contrast in live-workout mode.

- All interactive elements reachable and operable by keyboard; visible focus ring (2 px, brand, 2 px offset) never removed.
- Live workout announces step changes via `aria-live="assertive"`; the audio cue system doubles as the screen-reader experience.
- Timers expose an accessible text alternative that updates at most once every 10 s (not every second — that would flood a screen reader).
- Charts: `role="img"` with a generated summary, plus the table view.
- Colour contrast: body text ≥ 4.5:1, large text ≥ 3:1, UI boundaries ≥ 3:1.
- No information conveyed by colour alone, anywhere. This is checked in review, not assumed.
- Text scales to 200% without loss of function; layouts use `rem` and never fixed heights on text containers.
- Forms: real `<label>`s, `inputmode` and `autocomplete` set correctly, errors linked with `aria-describedby`.
- Target size ≥ 24 px minimum per WCAG 2.2 (we use 44 px, well clear).

---

## Emotional design

The tone rules are part of the design system because they're as load-bearing as the spacing scale.

**Copy voice:** warm, direct, second person, short sentences. Like a good coach who has seen a hundred first-timers and is not remotely worried about you.

| Situation        | ✅ Say                                                                   | ❌ Never say                           |
| ---------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| Missed session   | "Life happens. I've rebalanced the week."                                | "You failed to complete your workout." |
| Rest day         | "Rest day. This is when you actually get fitter."                        | "No activity scheduled."               |
| Hard week        | "This week is meant to feel hard. That's the point."                     | "Warning: high training load."         |
| Slow progress    | "You've trained 18 of the last 21 days. That's the whole game."          | "You're behind schedule."              |
| First open water | "It's normal to feel your breathing go weird for the first two minutes." | "Open water swimming carries risks."   |
| Race prediction  | "Somewhere around 1:35–1:55. It'll sharpen as you train."                | "Predicted time: 1:44:32"              |

**Forbidden patterns:** streak mechanics that break, red for missed sessions, leaderboards against strangers, comparative language ("slower than average"), guilt-based notifications, any use of the word "failed".

**Celebrate:** consistency, firsts, showing up on a bad day, finishing — in that order. Not just PRs.

---

## Iconography

Inline SVG only, 24 px grid, 2 px stroke, rounded caps. No icon font (bundle size + accessibility). Discipline icons are custom (wave, wheel, shoe); everything else comes from a single set (Lucide) subsetted to what's used.

Icons never appear alone as the sole label of an action, except in the bottom nav where labels are always present beneath them.

---

## Dark mode

Selected, not derived. Every token has an explicitly chosen dark value; nothing is an automatic inversion. Discipline and zone colours are re-stepped for the dark surface and re-validated as a set.

Live-workout mode has a dedicated **night theme** — near-black surface, maximum-contrast text — that engages automatically between sunset and sunrise, or manually. This is the one place where AAA contrast is mandatory.

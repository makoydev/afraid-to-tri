# ADR-0003 — Generic load metric names

**Status:** Accepted · 2026-08-02

## Context

The endurance-training world has settled on a vocabulary that is largely **trademarked by TrainingPeaks**: TSS™ (Training Stress Score), NP® (Normalized Power), IF® (Intensity Factor), and the CTL/ATL/TSB naming for the fitness–fatigue model.

The underlying science is not proprietary — Banister's impulse–response model dates to 1975, Foster's session-RPE to the late 1990s, and exponentially-weighted moving averages are just arithmetic. But the *names* are protected, and using them in a commercial product invites a trademark problem we have no interest in.

There's also a product reason. "Training Stress Score" is exactly the kind of term that makes a nervous beginner feel like this app isn't for them.

## Decision

Compute the same well-established quantities under generic names:

| Industry term | Ours |
|---|---|
| TSS | **Load** (Load Units, LU) |
| IF | **Intensity Ratio (IR)** |
| NP | **Weighted average power** |
| CTL | **Fitness** (42-day EWMA) |
| ATL | **Fatigue** (7-day EWMA) |
| TSB | **Freshness** |

Calibration is unchanged and intentionally familiar: **one hour at threshold = 100 LU**, so anyone arriving from another platform reads our numbers correctly without translation.

Additionally, the UI **always renders these as words before numbers** — "Building hard, that's normal mid-build" above the chart, not just a value.

## Consequences

**Good**
- No trademark exposure.
- Plainer language, consistent with [Principle 3](../00-vision.md#principles).
- Freedom to change the formula — notably the RPE-derived path — without misrepresenting someone else's defined metric. This matters: our RPE fallback would not be a valid TSS, but it is a perfectly valid Load.

**Bad**
- Experienced athletes have to map our names onto the ones they know. Mitigated by the identical 100-LU-per-threshold-hour calibration and a glossary entry that names the equivalence.
- Search and comparison friction: people google "TSS", not "Load Units".

## Alternatives considered

- **Use the trademarked terms anyway.** Common in hobby projects, unacceptable in a product we intend to ship.
- **Invent a completely different scale** (e.g. 0–10 "effort points"). Friendlier to beginners, but throws away comparability with every other tool an improver uses, and we'd lose them at exactly the point they start caring about numbers.
- **License from TrainingPeaks.** Cost and dependency out of all proportion to the benefit.

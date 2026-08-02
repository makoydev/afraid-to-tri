# ADR-0005 — RPE by default, numeric zones unlocked

**Status:** Accepted · 2026-08-02

## Context

Every training app has to decide how it expresses intensity. The options are effort-based (RPE, talk test) or measurement-based (heart rate, pace, power).

Measurement-based targets are more precise, and they're what experienced athletes expect. But they require:

- A device the athlete may not own (HR strap, power meter).
- A **test** — a maximal 20- or 30-minute time trial — that is genuinely unpleasant and completely demoralizing for someone who has never trained before.
- Understanding what the numbers mean.

Our primary persona ([Sam](../00-vision.md#primary--sam-the-nervous-first-timer)) has none of these. Asking a beginner for their FTP in onboarding is the single fastest way to lose them.

Meanwhile our secondary persona ([Priya](../00-vision.md#secondary--priya-the-improver)) will eventually find pure RPE limiting, and we've committed to letting Sam become Priya without hitting a wall.

## Decision

**RPE and the talk test are the default expression of intensity. Numeric zones are unlocked by testing.**

- Every session ships a plain-language cue: _"Comfortable — you could hold a conversation."_
- The load model computes from the best available signal, falling back through power → pace → HR → RPE, so a beginner logging by feel produces numbers on the same scale as an athlete with a power meter ([03](../03-training-model.md#load-model)).
- Fitness tests ([F-22](../01-product-spec.md#f-22--fitness-tests--zones--p1)) are offered, never required, and are **never scheduled in a first-timer's first two weeks**.
- Once a test exists, numeric targets appear _alongside_ the cue, never instead of it.
- Estimated values (e.g. HR max from an age formula) are always labelled as estimates.

## Consequences

**Good**

- Zero-equipment onboarding. A user with nothing but a phone gets a complete, usable plan.
- No demoralizing maximal test in week one.
- Progressive disclosure works exactly as [Principle 2](../00-vision.md#principles) intends — the same session renders at two altitudes.
- Session-RPE is a genuinely well-validated method, not a consolation prize. We're not shipping a worse metric; we're shipping a different valid one.

**Bad**

- RPE is subjective and noisy, so early load numbers are rougher. Handled by widening prediction ranges when RPE is the only source, and saying so.
- Two rendering paths for every intensity target, which is more UI work and more test surface.
- Athletes arriving from other platforms may see the RPE-first default as unsophisticated. Mitigated by making the unlock obvious and quick for anyone who wants it.

## Alternatives considered

- **Numeric zones from day one, estimated from age formulas.** Age-based HR max is ±10 bpm at one standard deviation — precise-looking numbers that are frequently wrong. Worse than honest subjectivity.
- **Force a test during onboarding.** Would improve data quality and destroy the funnel.
- **RPE only, forever.** Loses the improver exactly when they start caring, which is exactly when they'd start paying.

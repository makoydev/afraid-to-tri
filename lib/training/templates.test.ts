import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { TEMPLATES, templateById, type TemplateId } from './templates';
import { stepsTotalSeconds } from './safety';
import type { Session } from './types';

const ALL_IDS = Object.keys(TEMPLATES) as TemplateId[];

/** Wraps steps in just enough of a Session for `stepsTotalSeconds`. */
const asSession = (steps: ReturnType<(typeof TEMPLATES)[TemplateId]['build']>) =>
  ({ steps }) as unknown as Session;

describe('every workout template', () => {
  it.each(ALL_IDS)('%s declares the fields the UI depends on', (id) => {
    const t = templateById(id);
    expect(t.id).toBe(id);
    expect(t.title.length).toBeGreaterThan(3);
    expect(t.purpose.length).toBeGreaterThan(20);
    expect(t.zone).toBeGreaterThanOrEqual(1);
    expect(t.zone).toBeLessThanOrEqual(5);
    expect(t.minSeconds).toBeGreaterThan(0);
  });

  it.each(ALL_IDS)('%s explains itself without leading with jargon', (id) => {
    const purpose = templateById(id).purpose.toLowerCase();
    for (const word of ['lthr', 'ftp', 'tss', 'vo2max', 'css']) {
      expect(purpose).not.toContain(word);
    }
  });

  it.each(ALL_IDS)('%s builds steps that sum exactly to the requested duration', (id) => {
    const t = templateById(id);
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 120 }), (minutes) => {
        const total = minutes * 60;
        const steps = t.build(total);
        const summed = stepsTotalSeconds(asSession(steps));
        if (summed !== total) {
          throw new Error(`${id} @ ${String(minutes)}min: steps sum to ${String(summed)}, not ${String(total)}`);
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it.each(ALL_IDS)('%s never emits a zero-length or negative step', (id) => {
    const t = templateById(id);
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 120 }), (minutes) => {
        for (const step of t.build(minutes * 60)) {
          if (step.durationSec <= 0) {
            throw new Error(`${id} @ ${String(minutes)}min: step "${step.label}" is ${String(step.durationSec)}s`);
          }
          if (step.recovery && step.recovery.durationSec <= 0) {
            throw new Error(`${id} @ ${String(minutes)}min: recovery on "${step.label}" is non-positive`);
          }
          if ((step.repeats ?? 1) < 1) {
            throw new Error(`${id} @ ${String(minutes)}min: step "${step.label}" repeats < 1`);
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it.each(ALL_IDS)('%s gives every step a cue an athlete can act on', (id) => {
    for (const step of templateById(id).build(45 * 60)) {
      expect(step.label.length).toBeGreaterThan(2);
      expect(step.cue.length).toBeGreaterThan(3);
      expect(step.zone).toBeGreaterThanOrEqual(1);
      expect(step.zone).toBeLessThanOrEqual(5);
    }
  });
});

describe('brick session', () => {
  it('always contains a bike portion, a transition, and a run', () => {
    for (const minutes of [15, 20, 40, 60, 90]) {
      const labels = TEMPLATES['brick.bikerun'].build(minutes * 60).map((s) => s.label);
      expect(labels).toContain('Transition');
      expect(labels.some((l) => l.startsWith('Bike'))).toBe(true);
      expect(labels.some((l) => l.startsWith('Run'))).toBe(true);
    }
  });
});

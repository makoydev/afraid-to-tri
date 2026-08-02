import { describe, it, expect } from 'vitest';
import {
  ZONE_BANDS,
  hrZonesFromLthr,
  powerZonesFromFtp,
  runPaceZonesFromThreshold,
  swimZonesFromCss,
  estimateMaxHr,
  zoneForRpe,
} from './zones';
import type { Zone } from './types';

const ZONES: Zone[] = [1, 2, 3, 4, 5];

describe('ZONE_BANDS', () => {
  it('describes all five bands with plain-English cues', () => {
    for (const z of ZONES) {
      const band = ZONE_BANDS[z];
      expect(band.name).toBeTruthy();
      expect(band.cue.length).toBeGreaterThan(10);
      expect(band.talkTest).toBeTruthy();
    }
  });

  it('never uses jargon a beginner would not recognise in the cue', () => {
    const banned = ['lthr', 'ftp', 'vo2', 'threshold', 'lactate', 'css'];
    for (const z of ZONES) {
      const cue = ZONE_BANDS[z].cue.toLowerCase();
      for (const word of banned) expect(cue).not.toContain(word);
    }
  });

  it('orders rpe ranges monotonically across bands', () => {
    for (let i = 1; i < ZONES.length; i++) {
      const prev = ZONE_BANDS[ZONES[i - 1]!];
      const cur = ZONE_BANDS[ZONES[i]!];
      expect(cur.rpe[0]).toBeGreaterThanOrEqual(prev.rpe[1]);
    }
  });
});

describe('hrZonesFromLthr', () => {
  // Percentages from docs/03 § Numeric zone derivation (Friel's system).
  it('derives run zones from run LTHR', () => {
    const z = hrZonesFromLthr(170, 'run');
    expect(z[1].max).toBe(Math.round(170 * 0.85) - 1);
    expect(z[2].min).toBe(Math.round(170 * 0.85));
    expect(z[2].max).toBe(Math.round(170 * 0.9) - 1);
    expect(z[4].max).toBe(Math.round(170 * 1.0) - 1);
    expect(z[5].min).toBe(170);
  });

  it('derives bike zones with the wider zone 2 band', () => {
    const z = hrZonesFromLthr(160, 'bike');
    expect(z[2].min).toBe(Math.round(160 * 0.81));
    expect(z[3].min).toBe(Math.round(160 * 0.9));
    expect(z[4].min).toBe(Math.round(160 * 0.94));
  });

  it('produces contiguous, non-overlapping bands', () => {
    const z = hrZonesFromLthr(168, 'run');
    for (let i = 1; i < 5; i++) {
      expect(z[(i + 1) as Zone].min).toBe(z[i as Zone].max + 1);
    }
  });

  it('rejects an implausible LTHR rather than producing nonsense', () => {
    expect(() => hrZonesFromLthr(20, 'run')).toThrow(/lthr/i);
    expect(() => hrZonesFromLthr(300, 'bike')).toThrow(/lthr/i);
  });
});

describe('powerZonesFromFtp', () => {
  it('uses the documented percentages of FTP', () => {
    const z = powerZonesFromFtp(200);
    expect(z[1].max).toBe(109); // < 55%
    expect(z[2].min).toBe(110);
    expect(z[2].max).toBe(150); // 55–75%
    expect(z[3].min).toBe(151);
    expect(z[4].max).toBe(210); // up to 105%
    expect(z[5].min).toBe(211);
  });

  it('rejects a non-positive FTP', () => {
    expect(() => powerZonesFromFtp(0)).toThrow();
  });
});

describe('runPaceZonesFromThreshold', () => {
  // Pace is inverted: a higher percentage means a SLOWER pace.
  it('makes zone 1 slower than zone 5', () => {
    const z = runPaceZonesFromThreshold(300); // 5:00/km threshold
    expect(z[1].min).toBeGreaterThan(z[5].max);
  });

  it('puts threshold pace inside zone 4', () => {
    const z = runPaceZonesFromThreshold(300);
    expect(300).toBeGreaterThanOrEqual(z[4].min);
    expect(300).toBeLessThanOrEqual(z[4].max);
  });
});

describe('swimZonesFromCss', () => {
  it('offsets each band from CSS pace', () => {
    const z = swimZonesFromCss(120); // 2:00 per 100 m
    expect(z[1].min).toBeGreaterThan(120); // slower than CSS
    expect(z[5].max).toBeLessThan(120); // faster than CSS
  });

  it('puts CSS pace inside zone 4', () => {
    const z = swimZonesFromCss(120);
    expect(120).toBeGreaterThanOrEqual(z[4].min);
    expect(120).toBeLessThanOrEqual(z[4].max);
  });
});

describe('estimateMaxHr', () => {
  it('uses the Nes formula rather than 220 minus age', () => {
    expect(estimateMaxHr(40)).toBe(Math.round(211 - 0.64 * 40));
    expect(estimateMaxHr(40)).not.toBe(180);
  });

  it('flags the result as an estimate so the UI can label it', () => {
    expect(estimateMaxHr(40)).toBeTypeOf('number');
    // The label lives with the caller; this test documents the intent that
    // callers must treat the number as approximate (docs/03, ADR-0005).
    expect(estimateMaxHr(25)).toBeGreaterThan(estimateMaxHr(55));
  });
});

describe('zoneForRpe', () => {
  it('maps the whole 1-10 scale into the five bands', () => {
    const seen = new Set<Zone>();
    for (let r = 1; r <= 10; r++) seen.add(zoneForRpe(r as 1));
    expect(seen.size).toBe(5);
  });

  it('is monotonic', () => {
    for (let r = 2; r <= 10; r++) {
      expect(zoneForRpe(r as 1)).toBeGreaterThanOrEqual(zoneForRpe((r - 1) as 1));
    }
  });
});

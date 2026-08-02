import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  toIsoDate,
  parseIsoDate,
  addDays,
  addWeeks,
  daysBetween,
  startOfWeek,
  weekdayOf,
  eachDay,
  isWithin,
  isBlackedOut,
} from './calendar';
import type { IsoDate } from './types';

const d = (s: string) => s as IsoDate;

describe('toIsoDate / parseIsoDate', () => {
  it('round-trips a date without drifting', () => {
    expect(toIsoDate(parseIsoDate(d('2026-03-01')))).toBe('2026-03-01');
  });

  it('pads month and day', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('rejects a malformed date string', () => {
    expect(() => parseIsoDate('2026-3-1')).toThrow(/YYYY-MM-DD/);
    expect(() => parseIsoDate('not-a-date')).toThrow();
  });

  it('rejects a date that does not exist', () => {
    expect(() => parseIsoDate('2026-02-30')).toThrow(/not a real date/i);
  });

  it('round-trips every day across a leap year', () => {
    let cursor = d('2024-01-01');
    for (let i = 0; i < 366; i++) {
      expect(toIsoDate(parseIsoDate(cursor))).toBe(cursor);
      cursor = addDays(cursor, 1);
    }
    expect(cursor).toBe('2025-01-01');
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays(d('2026-01-31'), 1)).toBe('2026-02-01');
  });

  it('crosses a year boundary', () => {
    expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01');
  });

  it('handles 29 February in a leap year', () => {
    expect(addDays(d('2024-02-28'), 1)).toBe('2024-02-29');
    expect(addDays(d('2025-02-28'), 1)).toBe('2025-03-01');
  });

  it('goes backwards', () => {
    expect(addDays(d('2026-03-01'), -1)).toBe('2026-02-28');
  });

  it('is not affected by daylight-saving transitions', () => {
    // UK clocks go forward on 2026-03-29 and back on 2026-10-25.
    expect(addDays(d('2026-03-28'), 1)).toBe('2026-03-29');
    expect(addDays(d('2026-03-29'), 1)).toBe('2026-03-30');
    expect(addDays(d('2026-10-24'), 1)).toBe('2026-10-25');
    expect(addDays(d('2026-10-25'), 1)).toBe('2026-10-26');
  });

  it('is inverse to itself for any offset', () => {
    fc.assert(
      fc.property(fc.integer({ min: -2000, max: 2000 }), (n) => {
        const start = d('2026-06-15');
        return addDays(addDays(start, n), -n) === start;
      }),
    );
  });
});

describe('addWeeks', () => {
  it('adds seven days per week', () => {
    expect(addWeeks(d('2026-03-01'), 2)).toBe('2026-03-15');
  });
});

describe('daysBetween', () => {
  it('counts forward days', () => {
    expect(daysBetween(d('2026-03-01'), d('2026-03-08'))).toBe(7);
  });

  it('is negative when the target is in the past', () => {
    expect(daysBetween(d('2026-03-08'), d('2026-03-01'))).toBe(-7);
  });

  it('is zero for the same day', () => {
    expect(daysBetween(d('2026-03-01'), d('2026-03-01'))).toBe(0);
  });

  it('spans a daylight-saving change without an off-by-one', () => {
    expect(daysBetween(d('2026-03-25'), d('2026-04-01'))).toBe(7);
    expect(daysBetween(d('2026-10-22'), d('2026-10-29'))).toBe(7);
  });
});

describe('weekdayOf', () => {
  it('uses ISO ordering where Monday is 0', () => {
    expect(weekdayOf(d('2026-03-02'))).toBe(0); // a Monday
    expect(weekdayOf(d('2026-03-08'))).toBe(6); // the following Sunday
  });
});

describe('startOfWeek', () => {
  it('returns the Monday of the containing week', () => {
    expect(startOfWeek(d('2026-03-05'))).toBe('2026-03-02');
  });

  it('is idempotent on a Monday', () => {
    expect(startOfWeek(d('2026-03-02'))).toBe('2026-03-02');
  });

  it('treats Sunday as the end of its week, not the start of the next', () => {
    expect(startOfWeek(d('2026-03-08'))).toBe('2026-03-02');
  });
});

describe('eachDay', () => {
  it('is inclusive of both ends', () => {
    expect(eachDay(d('2026-03-01'), d('2026-03-03'))).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
    ]);
  });

  it('returns a single day when the range has no width', () => {
    expect(eachDay(d('2026-03-01'), d('2026-03-01'))).toEqual(['2026-03-01']);
  });

  it('returns nothing for an inverted range', () => {
    expect(eachDay(d('2026-03-03'), d('2026-03-01'))).toEqual([]);
  });
});

describe('isWithin / isBlackedOut', () => {
  const holiday = { from: d('2026-07-10'), to: d('2026-07-20') };

  it('includes both endpoints', () => {
    expect(isWithin(d('2026-07-10'), holiday)).toBe(true);
    expect(isWithin(d('2026-07-20'), holiday)).toBe(true);
  });

  it('excludes days either side', () => {
    expect(isWithin(d('2026-07-09'), holiday)).toBe(false);
    expect(isWithin(d('2026-07-21'), holiday)).toBe(false);
  });

  it('checks a day against every blackout range', () => {
    const ranges = [holiday, { from: d('2026-09-01'), to: d('2026-09-03') }];
    expect(isBlackedOut(d('2026-09-02'), ranges)).toBe(true);
    expect(isBlackedOut(d('2026-08-02'), ranges)).toBe(false);
    expect(isBlackedOut(d('2026-08-02'), [])).toBe(false);
  });
});

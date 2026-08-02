import type { DateRange, IsoDate, Weekday } from './types';

/**
 * Calendar arithmetic on `YYYY-MM-DD` strings.
 *
 * The athlete's Tuesday is a Tuesday regardless of timezone, so a training day
 * is a calendar day, never an instant. Everything here works on local-noon
 * `Date` objects, which keeps daylight-saving transitions from shifting a
 * session onto the wrong day.
 *
 * Pure by construction: no function reads the current time (ADR-0006).
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midday avoids every DST edge — a ±1 hour shift can never cross a date line. */
const NOON = 12;

export function parseIsoDate(value: IsoDate | string): Date {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw new TypeError(`Expected a date in YYYY-MM-DD form, got "${String(value)}".`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, NOON);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new RangeError(`"${String(value)}" is not a real date.`);
  }
  return date;
}

export function toIsoDate(date: Date): IsoDate {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}` as IsoDate;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = parseIsoDate(date);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export function addWeeks(date: IsoDate, weeks: number): IsoDate {
  return addDays(date, weeks * 7);
}

const MS_PER_DAY = 86_400_000;

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = parseIsoDate(from).getTime();
  const b = parseIsoDate(to).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/** ISO weekday: Monday is 0, Sunday is 6. */
export function weekdayOf(date: IsoDate): Weekday {
  return ((parseIsoDate(date).getDay() + 6) % 7) as Weekday;
}

/** The Monday of the week containing `date`. */
export function startOfWeek(date: IsoDate): IsoDate {
  return addDays(date, -weekdayOf(date));
}

/** Every day from `from` to `to`, inclusive. Empty if the range is inverted. */
export function eachDay(from: IsoDate, to: IsoDate): IsoDate[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];
  const out: IsoDate[] = [];
  for (let i = 0; i <= span; i++) out.push(addDays(from, i));
  return out;
}

export function isWithin(date: IsoDate, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

export function isBlackedOut(date: IsoDate, ranges: readonly DateRange[]): boolean {
  return ranges.some((range) => isWithin(date, range));
}

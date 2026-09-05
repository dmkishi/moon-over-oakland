/**
 * Verifies `calculateDayEvents()`'s rise/set times against JPL Horizons
 * reference data at `./fixtures/day-events.accuracy.jsonc`, plus the two
 * daylight saving transition days of 2026.
 */
import { describe, it, expect } from 'vitest';
import { Temporal } from 'temporal-polyfill/implementation';
import { accuracyFixtures } from './fixtures/helpers.ts';
import { calculateDayEvents, type DayEvents } from '../src/ephemeris/day-events.ts';
import { observer } from '../src/observer.ts';

const TOLERANCE_MINUTES = 15;

const { timezone, latitude, longitude } = observer;

/**
 * Called per test, not hoisted into the `describe` body: a hoisted call runs at
 * collection time, where a throw fails the whole file and the work happens even
 * under a filter that excludes it. Recomputing costs tens of milliseconds.
 */
function calculate(date: Temporal.PlainDate): DayEvents {
  return calculateDayEvents(date, timezone, latitude, longitude);
}

function minutesBetween(a: Temporal.ZonedDateTime, isoDateTime: string): number {
  return Math.abs(a.epochMilliseconds - new Date(isoDateTime).getTime()) / 60_000;
}

for (const fixture of accuracyFixtures) {
  describe(`calculateDayEvents(${fixture.description ?? fixture.day})`, () => {
    const date = Temporal.PlainDate.from(fixture.day);
    const { moonrise, moonset, sunrise, sunset } = fixture.events;

    it('moonset comes after moonrise', () => {
      const result = calculate(date);
      expect(Temporal.ZonedDateTime.compare(result.moonset, result.moonrise)).toBe(1);
    });

    it('sunset comes after sunrise', () => {
      const result = calculate(date);
      expect(Temporal.ZonedDateTime.compare(result.sunset, result.sunrise)).toBe(1);
    });

    // oxlint-disable-next-line no-negated-condition - Echo shape below
    if (moonrise !== null) {
      it(`moonrise matches within ±${TOLERANCE_MINUTES} minutes`, () => {
        expect(minutesBetween(calculate(date).moonrise, moonrise.dateTime)).toBeLessThanOrEqual(TOLERANCE_MINUTES);
      });
    } else {
      it('moonrise borrows from the previous day', () => {
        expect(calculate(date).moonrise.toPlainDate().equals(date.subtract({ days: 1 }))).toBe(true);
      });
    }

    // The fixture lists the moonset that occurs on that civil day but
    // `calculateDayEvents()` returns the moonset that comes after its rise.
    if (moonset !== null && (moonrise === null || new Date(moonset.dateTime) > new Date(moonrise.dateTime))) {
      it(`moonset matches within ±${TOLERANCE_MINUTES} minutes`, () => {
        expect(minutesBetween(calculate(date).moonset, moonset.dateTime)).toBeLessThanOrEqual(TOLERANCE_MINUTES);
      });
    } else {
      it('moonset falls on the next day', () => {
        expect(calculate(date).moonset.toPlainDate().equals(date.add({ days: 1 }))).toBe(true);
      });
    }

    const sunEvents = [
      ['sunrise', sunrise],
      ['sunset', sunset],
    ] as const;
    for (const [name, expected] of sunEvents) {
      it(`${name} matches within ±${TOLERANCE_MINUTES} minutes`, () => {
        expect(minutesBetween(calculate(date)[name], expected.dateTime)).toBeLessThanOrEqual(TOLERANCE_MINUTES);
      });
    }
  });
}

describe('daylight saving time', () => {
  it('2026-03-08, a 23-hour day without a moonrise, borrows the previous day\'s', () => {
    const date = Temporal.PlainDate.from('2026-03-08');
    expect(date.toZonedDateTime({ timeZone: timezone }).hoursInDay).toBe(23);

    const result = calculate(date);
    expect(result.moonrise.toPlainDate().toString()).toBe('2026-03-07');
    expect(result.moonset.toPlainDate().toString()).toBe('2026-03-08');
    expect(Temporal.ZonedDateTime.compare(result.moonset, result.moonrise)).toBe(1);
  });

  it('2026-11-01, a 25-hour day, keeps its events in local time', () => {
    const date = Temporal.PlainDate.from('2026-11-01');
    expect(date.toZonedDateTime({ timeZone: timezone }).hoursInDay).toBe(25);

    const result = calculate(date);
    // The rise falls after the 02:00 fall back, on standard time; its set
    // chases it onto the next civil day.
    expect(result.moonrise.offset).toBe('-08:00');
    expect(result.moonrise.toPlainDate().toString()).toBe('2026-11-01');
    expect(result.moonset.toPlainDate().toString()).toBe('2026-11-02');
  });
});

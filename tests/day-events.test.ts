/**
 * Verifies `calculateDayEvents()`'s rise/set times against JPL Horizons
 * reference data at `./fixtures/moonPost.accuracy.jsonc`, plus the two
 * daylight saving transition days of 2026.
 */
import { describe, it, expect } from 'vitest';
import { Temporal } from 'temporal-polyfill/implementation';
import { calculateDayEvents } from '../src/ephemeris/day-events.ts';
import { observer } from '../src/observer.ts';
import { loadFixture } from './loadFixture.ts';

const TOLERANCE_MINUTES = 15;

interface AccuracyFixture {
  description?: string;
  day: string;
  events: {
    moonrise: { dateTime: string } | null;
    moonset: { dateTime: string } | null;
    sunrise: { dateTime: string } | null;
    sunset: { dateTime: string } | null;
  };
}

const { timezone, latitude, longitude } = observer;

function minutesBetween(a: Temporal.ZonedDateTime, isoDateTime: string): number {
  return Math.abs(a.epochMilliseconds - new Date(isoDateTime).getTime()) / 60_000;
}

const accuracyFixtures = loadFixture<AccuracyFixture[]>(
  new URL('./fixtures/moonPost.accuracy.jsonc', import.meta.url)
);

for (const fixture of accuracyFixtures) {
  describe(`calculateDayEvents(${fixture.description || fixture.day})`, () => {
    const date = Temporal.PlainDate.from(fixture.day);
    const result = calculateDayEvents(date, timezone, latitude, longitude);
    const { moonrise, moonset, sunrise, sunset } = fixture.events;

    it('moonset follows moonrise', () => {
      expect(Temporal.ZonedDateTime.compare(result.moonset, result.moonrise)).toBe(1);
    });

    it('sunset follows sunrise', () => {
      expect(Temporal.ZonedDateTime.compare(result.sunset, result.sunrise)).toBe(1);
    });

    if (moonrise !== null) {
      it(`moonrise matches within ±${TOLERANCE_MINUTES} minutes`, () => {
        expect(minutesBetween(result.moonrise, moonrise.dateTime)).toBeLessThanOrEqual(TOLERANCE_MINUTES);
      });
    } else {
      it('moonrise borrows from the previous day', () => {
        expect(result.moonrise.toPlainDate().equals(date.subtract({ days: 1 }))).toBe(true);
      });
    }

    // The fixture's moonset is the civil day's; it is the pair's set only when
    // it follows the pair's rise. Otherwise the paired set falls on the next
    // day, outside the fixture's data, and the ordering check above stands in.
    const moonsetFollowsRise = moonset !== null &&
      (moonrise === null || new Date(moonset.dateTime) > new Date(moonrise.dateTime));
    if (moonsetFollowsRise) {
      it(`moonset matches within ±${TOLERANCE_MINUTES} minutes`, () => {
        expect(minutesBetween(result.moonset, moonset.dateTime)).toBeLessThanOrEqual(TOLERANCE_MINUTES);
      });
    }

    const sunEvents = [
      ['sunrise', result.sunrise, sunrise],
      ['sunset', result.sunset, sunset],
    ] as const;
    for (const [name, actual, expected] of sunEvents) {
      if (expected === null) continue;

      it(`${name} matches within ±${TOLERANCE_MINUTES} minutes`, () => {
        expect(minutesBetween(actual, expected.dateTime)).toBeLessThanOrEqual(TOLERANCE_MINUTES);
      });
    }
  });
}

describe('daylight saving time', () => {
  it('2026-03-08, a 23-hour day without a moonrise, borrows the previous day\'s', () => {
    const date = Temporal.PlainDate.from('2026-03-08');
    expect(date.toZonedDateTime({ timeZone: timezone }).hoursInDay).toBe(23);

    const result = calculateDayEvents(date, timezone, latitude, longitude);
    expect(result.moonrise.toPlainDate().toString()).toBe('2026-03-07');
    expect(result.moonset.toPlainDate().toString()).toBe('2026-03-08');
    expect(Temporal.ZonedDateTime.compare(result.moonset, result.moonrise)).toBe(1);
  });

  it('2026-11-01, a 25-hour day, keeps its events in local time', () => {
    const date = Temporal.PlainDate.from('2026-11-01');
    expect(date.toZonedDateTime({ timeZone: timezone }).hoursInDay).toBe(25);

    const result = calculateDayEvents(date, timezone, latitude, longitude);
    // The rise falls after the 02:00 fall back, on standard time; its set
    // chases it onto the next civil day.
    expect(result.moonrise.offset).toBe('-08:00');
    expect(result.moonrise.toPlainDate().toString()).toBe('2026-11-01');
    expect(result.moonset.toPlainDate().toString()).toBe('2026-11-02');
  });
});

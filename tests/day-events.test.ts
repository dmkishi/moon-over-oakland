/**
 * Verifies `calculateDayEvents()`'s rise/set times against JPL Horizons
 * reference data at `./fixtures/day-events.accuracy.jsonc`, plus the two
 * daylight saving transition days of 2026.
 */
import { describe, it, expect } from 'vitest';
import { dayEventFixtures } from './fixtures/index.ts';
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

function calculateNight(date: Temporal.PlainDate): DayEvents {
  return calculateDayEvents(date, timezone, latitude, longitude, 'night');
}

function minutesBetween(a: Temporal.ZonedDateTime, isoDateTime: string): number {
  return Math.abs(a.epochMilliseconds - new Date(isoDateTime).getTime()) / 60_000;
}

for (const fixture of dayEventFixtures) {
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

/**
 * The `night` window runs from noon on the previous day to noon on the day, so
 * a last quarter post pairs the moon up at dawn rather than the day's own late
 * evening rise. Rise and set instants from JPL Horizons.
 */
describe('night moonrise window', () => {
  const cases = [
    {
      day: '2026-11-01',
      description: 'skips the day\'s own 23:43 rise for the previous night\'s',
      moonrise: '2026-10-31T23:30:00-07:00',
      moonset: '2026-11-01T13:19:00-08:00',
    },
    {
      day: '2026-08-05',
      description: 'skips the day\'s own 23:48 rise for the previous night\'s',
      moonrise: '2026-08-04T23:14:00-07:00',
      moonset: '2026-08-05T13:41:00-07:00',
    },
    {
      day: '2026-01-10',
      description: 'keeps an after-midnight rise',
      moonrise: '2026-01-10T00:15:00-08:00',
      moonset: '2026-01-10T11:28:00-08:00',
    },
  ];

  for (const { day, description, moonrise, moonset } of cases) {
    describe(`${day} ${description}`, () => {
      const date = Temporal.PlainDate.from(day);

      it(`moonrise matches within ±${TOLERANCE_MINUTES} minutes`, () => {
        expect(minutesBetween(calculateNight(date).moonrise, moonrise)).toBeLessThanOrEqual(TOLERANCE_MINUTES);
      });

      it(`moonset matches within ±${TOLERANCE_MINUTES} minutes`, () => {
        expect(minutesBetween(calculateNight(date).moonset, moonset)).toBeLessThanOrEqual(TOLERANCE_MINUTES);
      });
    });
  }

  it('2026-03-08, a 23-hour day without a moonrise, finds the previous evening\'s inside the window', () => {
    const date = Temporal.PlainDate.from('2026-03-08');
    const night = calculateNight(date);
    expect(night.moonrise.toPlainDate().toString()).toBe('2026-03-07');
    expect(night.moonrise.hour).toBe(22);
    expect(night.moonrise.equals(calculate(date).moonrise)).toBe(true);
  });

  it('leaves the sun times on the civil day', () => {
    const date = Temporal.PlainDate.from('2026-11-01');
    const night = calculateNight(date);
    const day = calculate(date);
    expect(night.sunrise.equals(day.sunrise)).toBe(true);
    expect(night.sunset.equals(day.sunset)).toBe(true);
  });
});

/**
 * Verifies `calculateDayEvents()`'s rise/set times against JPL Horizons
 * reference data at `../fixtures/day-events.accuracy.jsonc`, plus the two
 * daylight saving transition days of 2026.
 */
import { describe, it, expect } from 'vitest';
import { dayEventFixtures, type DayEventFixture } from '../fixtures/index.ts';
import { calculateDayEvents } from '../support/observer.ts';
import { hoursInDay } from '../support/time.ts';

const TOLERANCE = { minutes: 15 };

/**
 * The fixture's moonset, if it's the one `calculateDayEvents()` returns, or
 * null if that one falls on the next day. The fixture lists the moonset that
 * occurs on the civil day, but `calculateDayEvents()` returns the moonset that
 * comes after its rise.
 */
function expectedMoonset({ events: { moonrise, moonset } }: DayEventFixture): string | null {
  if (moonset === null) return null;
  if (moonrise !== null && new Date(moonset.dateTime) <= new Date(moonrise.dateTime)) return null;
  return moonset.dateTime;
}

for (const fixture of dayEventFixtures) {
  describe(`calculateDayEvents(${fixture.description ?? fixture.day})`, () => {
    const date = Temporal.PlainDate.from(fixture.day);
    const { moonrise, sunrise, sunset } = fixture.events;
    const moonset = expectedMoonset(fixture);

    it('moonset comes after moonrise', () => {
      const result = calculateDayEvents(date);
      expect(Temporal.ZonedDateTime.compare(result.moonset, result.moonrise)).toBe(1);
    });

    it('sunset comes after sunrise', () => {
      const result = calculateDayEvents(date);
      expect(Temporal.ZonedDateTime.compare(result.sunset, result.sunrise)).toBe(1);
    });

    if (moonrise === null) {
      it('moonrise borrows from the previous day', () => {
        expect(calculateDayEvents(date).moonrise.toPlainDate().equals(date.subtract({ days: 1 }))).toBe(true);
      });
    } else {
      it(`moonrise matches within ±${TOLERANCE.minutes} minutes`, () => {
        expect(calculateDayEvents(date).moonrise).toBeWithin(moonrise.dateTime, TOLERANCE);
      });
    }

    if (moonset === null) {
      it('moonset falls on the next day', () => {
        expect(calculateDayEvents(date).moonset.toPlainDate().equals(date.add({ days: 1 }))).toBe(true);
      });
    } else {
      it(`moonset matches within ±${TOLERANCE.minutes} minutes`, () => {
        expect(calculateDayEvents(date).moonset).toBeWithin(moonset, TOLERANCE);
      });
    }

    const sunEvents = [
      ['sunrise', sunrise],
      ['sunset', sunset],
    ] as const;
    for (const [name, expected] of sunEvents) {
      it(`${name} matches within ±${TOLERANCE.minutes} minutes`, () => {
        expect(calculateDayEvents(date)[name]).toBeWithin(expected.dateTime, TOLERANCE);
      });
    }
  });
}

describe('daylight saving time', () => {
  it('2026-03-08, a 23-hour day without a moonrise, borrows the previous day\'s', () => {
    const date = Temporal.PlainDate.from('2026-03-08');
    expect(hoursInDay(date)).toBe(23);

    const result = calculateDayEvents(date);
    expect(result.moonrise.toPlainDate().toString()).toBe('2026-03-07');
    expect(result.moonset.toPlainDate().toString()).toBe('2026-03-08');
    expect(Temporal.ZonedDateTime.compare(result.moonset, result.moonrise)).toBe(1);
  });

  it('2026-11-01, a 25-hour day, keeps its events in local time', () => {
    const date = Temporal.PlainDate.from('2026-11-01');
    expect(hoursInDay(date)).toBe(25);

    const result = calculateDayEvents(date);
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

      it(`moonrise matches within ±${TOLERANCE.minutes} minutes`, () => {
        expect(calculateDayEvents(date, 'night').moonrise).toBeWithin(moonrise, TOLERANCE);
      });

      it(`moonset matches within ±${TOLERANCE.minutes} minutes`, () => {
        expect(calculateDayEvents(date, 'night').moonset).toBeWithin(moonset, TOLERANCE);
      });
    });
  }

  it('2026-03-08, a 23-hour day without a moonrise, finds the previous evening\'s inside the window', () => {
    const date = Temporal.PlainDate.from('2026-03-08');
    const night = calculateDayEvents(date, 'night');
    expect(night.moonrise.toPlainDate().toString()).toBe('2026-03-07');
    expect(night.moonrise.hour).toBe(22);
    expect(night.moonrise.equals(calculateDayEvents(date).moonrise)).toBe(true);
  });

  it('leaves the sun times on the civil day', () => {
    const date = Temporal.PlainDate.from('2026-11-01');
    const night = calculateDayEvents(date, 'night');
    const day = calculateDayEvents(date);
    expect(night.sunrise.equals(day.sunrise)).toBe(true);
    expect(night.sunset.equals(day.sunset)).toBe(true);
  });
});

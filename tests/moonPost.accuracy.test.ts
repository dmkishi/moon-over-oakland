/**
 * Verifies that calculateMoonPost() returns accurate illumination, distance,
 * rise/set times, and azimuth/tilt values against known astronomical data.
 */
import { describe, it, expect } from 'vitest';
import { Temporal } from '@js-temporal/polyfill';
import { calculateMoonPost } from '../src/moonPost';
import { location } from '../src/constants';
import { loadFixture } from './loadFixture';

const TOLERANCE = {
  illumination: 5,
  distanceKm: 10_000,
  timeMinutes: 15,
  azimuthDeg: 5,
  tiltDeg: 5,
};

interface CelestialEvent {
  dateTime: string | null;
}

interface MoonEvent extends CelestialEvent {
  azimuthDeg: number | null;
  tiltDeg: number | null;
}

interface Fixture {
  description?: string;
  day: string;
  noon: {
    illumination: number;
    distanceKm: number;
  };
  events: {
    moonrise: MoonEvent;
    moonset: MoonEvent;
    sunrise: CelestialEvent;
    sunset: CelestialEvent;
  };
}

const fixtures = loadFixture<Fixture[]>(
  new URL('./fixtures/moonPost.accuracy.jsonc', import.meta.url)
);

const COMPASS_DIRECTIONS = new Set([
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
]);

const { timezone, latitude, longitude } = location;

/** Maps fixture event names to MoonPost field names. */
const RESULT_KEY = {
  moonrise: 'moonRise',
  moonset: 'moonSet',
  sunrise: 'sunrise',
  sunset: 'sunset',
} as const;

function minutesBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60_000;
}

/**
 * Assert diff ≤ tolerance. Unlike Vitest's expect(), which appends its own
 * assertion details after the custom message, this throws only the given message.
 */
function expectWithin(diff: number, tolerance: number, message: string): void {
  if (diff > tolerance) {
    const error = new Error(message);
    error.name = 'AssertionError';
    throw error;
  }
}

for (const fixture of fixtures) {
  const label = fixture.description || fixture.day;
  const date = new Date(Temporal.PlainDate.from(fixture.day).toZonedDateTime(timezone).epochMilliseconds);

  describe(`calculateMoonPost(${label})`, () => {
    const result = calculateMoonPost(date, timezone, latitude, longitude);

    it('returns all expected fields', () => {
      expect(result.day).toBeInstanceOf(Date);
      expect(result.average).toBeDefined();
      expect(result.moonRise).toBeDefined();
      expect(result.moonSet).toBeDefined();
      expect(result.sunrise).toBeDefined();
      expect(result.sunset).toBeDefined();
    });

    it('average fields are within valid ranges', () => {
      expect(result.average.distanceKm).toBeGreaterThanOrEqual(356_000);
      expect(result.average.distanceKm).toBeLessThanOrEqual(407_000);
    });

    it('celestial event dates are valid Date objects', () => {
      for (const event of [result.moonRise, result.moonSet, result.sunrise, result.sunset]) {
        expect(event.date).toBeInstanceOf(Date);
        expect(isNaN(event.date.getTime())).toBe(false);
      }
    });

    it('compass directions are valid 16-point values', () => {
      for (const event of [result.moonRise, result.moonSet, result.sunrise, result.sunset]) {
        expect(COMPASS_DIRECTIONS.has(event.compassDirection)).toBe(true);
      }
    });

    it(`illumination is within ±${TOLERANCE.illumination}%`, () => {
      const expected = fixture.noon.illumination;
      const actual = result.average.illumination * 100;
      const diff = Math.abs(actual - expected);
      const toStr = (value: number): string => `${value.toFixed(1)}%`;
      expectWithin(
        diff,
        TOLERANCE.illumination,
        `expected ${toStr(expected)}, got ${toStr(actual)} (Δ ${toStr(diff)})`
      );
    });

    it(`distanceKm is within ±${TOLERANCE.distanceKm} km`, () => {
      const expected = fixture.noon.distanceKm;
      const actual = result.average.distanceKm;
      const diff = Math.abs(actual - expected);
      const toStr = (value: number): string => `${Math.round(value).toLocaleString('en-US')} km`;
      expectWithin(
        diff,
        TOLERANCE.distanceKm,
        `expected ${toStr(expected)}, got ${toStr(actual)} (Δ ${toStr(diff)})`
      );
    });

    const eventNames = ['moonrise', 'moonset', 'sunrise', 'sunset'] as const;
    for (const name of eventNames) {
      const fixtureEvent = fixture.events[name];
      const resultKey = RESULT_KEY[name];

      if (fixtureEvent.dateTime != null) {
        it(`${name} time is within ±${TOLERANCE.timeMinutes} minutes`, () => {
          const expected = new Date(fixtureEvent.dateTime!);
          const actual = result[resultKey].date;
          const diff = minutesBetween(actual, expected);
          expectWithin(
            diff,
            TOLERANCE.timeMinutes,
            `expected ${expected.toISOString()}, got ${actual.toISOString()} (Δ ${diff.toFixed(1)} min)`
          );
        });
      }

      if ('azimuthDeg' in fixtureEvent && fixtureEvent.azimuthDeg != null) {
        it(`${name} azimuth is within ±${TOLERANCE.azimuthDeg}°`, () => {
          const expected = fixtureEvent.azimuthDeg!;
          const actual = result[resultKey].compassDeg;
          const diff = Math.abs(actual - expected);
          const toStr = (value: number): string => `${value.toFixed(1)}°`;
          expectWithin(
            diff,
            TOLERANCE.azimuthDeg,
            `expected ${toStr(expected)}, got ${toStr(actual)} (Δ ${toStr(diff)})`
          );
        });

        it(`${name} tilt is within ±${TOLERANCE.tiltDeg}°`, () => {
          const expected = (fixtureEvent as MoonEvent).tiltDeg!;
          const actual = (result[resultKey] as { tiltDeg: number }).tiltDeg;
          const diff = Math.abs(actual - expected);
          const toStr = (value: number): string => `${value.toFixed(1)}°`;
          expectWithin(
            diff,
            TOLERANCE.tiltDeg,
            `expected ${toStr(expected)}, got ${toStr(actual)} (Δ ${toStr(diff)})`
          );
        });
      }
    }
  });
}

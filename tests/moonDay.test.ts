import { describe, it, expect } from 'vitest';
import { Temporal } from '@js-temporal/polyfill';
import { calculateMoonDay } from '../src/moonDay';
import { location } from '../src/constants';
import fixtures from './fixtures/moonDayFixtures.json';

const TOLERANCE = {
  illumination: 5,
  distanceKm: 5000,
  timeMinutes: 10,
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

const COMPASS_DIRECTIONS = new Set([
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
]);

const { timezone, latitude, longitude } = location;

function minutesBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60_000;
}

for (const fixture of fixtures as Fixture[]) {
  const label = fixture.description || fixture.day;
  const date = new Date(Temporal.PlainDate.from(fixture.day).toZonedDateTime(timezone).epochMilliseconds);

  describe(`calculateMoonDay(${label})`, () => {
    const result = calculateMoonDay(date, timezone, latitude, longitude);

    it('returns all expected fields', () => {
      expect(result.day).toBeInstanceOf(Date);
      expect(result.average).toBeDefined();
      expect(result.moonrise).toBeDefined();
      expect(result.moonset).toBeDefined();
      expect(result.sunrise).toBeDefined();
      expect(result.sunset).toBeDefined();
    });

    it('average fields are within valid ranges', () => {
      expect(result.average.phase).toBeGreaterThanOrEqual(0);
      expect(result.average.phase).toBeLessThanOrEqual(1);
      expect(result.average.distanceKm).toBeGreaterThanOrEqual(356_000);
      expect(result.average.distanceKm).toBeLessThanOrEqual(407_000);
    });

    it('celestial event dates are valid Date objects', () => {
      for (const event of [result.moonrise, result.moonset, result.sunrise, result.sunset]) {
        expect(event.date).toBeInstanceOf(Date);
        expect(isNaN(event.date.getTime())).toBe(false);
      }
    });

    it('compass directions are valid 16-point values', () => {
      for (const event of [result.moonrise, result.moonset, result.sunrise, result.sunset]) {
        expect(COMPASS_DIRECTIONS.has(event.compassDirection)).toBe(true);
      }
    });

    it(`illumination is within ±${TOLERANCE.illumination}%`, () => {
      const diff = Math.abs(result.average.illumination * 100 - fixture.noon.illumination);
      expect(diff).toBeLessThanOrEqual(TOLERANCE.illumination);
    });

    it(`distanceKm is within ±${TOLERANCE.distanceKm} km`, () => {
      const diff = Math.abs(result.average.distanceKm - fixture.noon.distanceKm);
      expect(diff).toBeLessThanOrEqual(TOLERANCE.distanceKm);
    });

    const eventNames = ['moonrise', 'moonset', 'sunrise', 'sunset'] as const;
    for (const name of eventNames) {
      const fixtureEvent = fixture.events[name];

      if (fixtureEvent.dateTime != null) {
        it(`${name} time is within ±${TOLERANCE.timeMinutes} minutes`, () => {
          const expected = new Date(fixtureEvent.dateTime!);
          const actual = result[name].date;
          expect(minutesBetween(actual, expected)).toBeLessThanOrEqual(TOLERANCE.timeMinutes);
        });
      }

      if ('azimuthDeg' in fixtureEvent && fixtureEvent.azimuthDeg != null) {
        it(`${name} azimuth is within ±${TOLERANCE.azimuthDeg}°`, () => {
          const diff = Math.abs(result[name].compassDeg - fixtureEvent.azimuthDeg!);
          expect(diff).toBeLessThanOrEqual(TOLERANCE.azimuthDeg);
        });

        it(`${name} tilt is within ±${TOLERANCE.tiltDeg}°`, () => {
          const diff = Math.abs((result[name] as { tiltDeg: number }).tiltDeg - (fixtureEvent as MoonEvent).tiltDeg!);
          expect(diff).toBeLessThanOrEqual(TOLERANCE.tiltDeg);
        });
      }
    }
  });
}

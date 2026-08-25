/**
 * Verifies `calculatePhaseEvent()`'s posting decisions against every principal
 * phase of 2026 and its rise/set times against JPL Horizons reference data.
 *
 * Posting rules at `./fixtures/phase-event.posting.jsonc`, transcribed from
 * `docs/posting-algorithm.md`; celestial events at
 * `./fixtures/moonPost.accuracy.jsonc`.
 */
import { describe, it, expect } from 'vitest';
import { Temporal } from '@js-temporal/polyfill';
import { calculateDayEvents, calculatePhaseEvent, type PhaseEvent } from '../src/phase-event.ts';
import { observer } from '../src/observer.ts';
import { loadFixture } from './loadFixture.ts';

const TOLERANCE_MINUTES = 15;

interface PostingFixture {
  eventDate: string;
  phaseType: PhaseEvent['phaseType'];
  post: 'same' | 'prev';
}

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

/** Maps `PhaseEvent['phaseType']` values to `nextPhases` keys. */
const NEXT_PHASE_KEY = {
  'new': 'new',
  'first-quarter': 'firstQuarter',
  'full': 'full',
  'last-quarter': 'lastQuarter',
} as const;

function calculate(date: Temporal.PlainDate): PhaseEvent | null {
  return calculatePhaseEvent(date, timezone, latitude, longitude);
}

function minutesBetween(a: Temporal.ZonedDateTime, isoDateTime: string): number {
  return Math.abs(a.epochMilliseconds - new Date(isoDateTime).getTime()) / 60_000;
}

const postingFixtures = loadFixture<PostingFixture[]>(
  new URL('./fixtures/phase-event.posting.jsonc', import.meta.url)
);

for (const fixture of postingFixtures) {
  const eventDate = Temporal.PlainDate.from(fixture.eventDate);
  const postDate = fixture.post === 'prev' ? eventDate.subtract({ days: 1 }) : eventDate;

  describe(`${fixture.phaseType} on ${fixture.eventDate} (${fixture.post})`, () => {
    it(`posts on ${postDate}`, () => {
      const result = calculate(postDate);
      expect(result).not.toBeNull();
      expect(result!.phaseType).toBe(fixture.phaseType);
      expect(result!.eventDay).toBe(fixture.post === 'same' ? 'today' : 'tomorrow');
      expect(result!.events.phase.toPlainDate().equals(eventDate)).toBe(true);
    });

    it('does not count its own phase as next', () => {
      const result = calculate(postDate)!;
      const nextOfSameType = result.nextPhases[NEXT_PHASE_KEY[fixture.phaseType]];
      expect(Temporal.ZonedDateTime.compare(nextOfSameType, result.events.phase)).toBe(1);
    });

    it('does not post on adjacent days', () => {
      expect(calculate(postDate.subtract({ days: 1 }))).toBeNull();
      expect(calculate(postDate.add({ days: 1 }))).toBeNull();
    });
  });
}

const accuracyFixtures = loadFixture<AccuracyFixture[]>(
  new URL('./fixtures/moonPost.accuracy.jsonc', import.meta.url)
);

for (const fixture of accuracyFixtures) {
  describe(`calculateDayEvents(${fixture.description || fixture.day})`, () => {
    const date = Temporal.PlainDate.from(fixture.day);
    const result = calculateDayEvents(date, timezone, latitude, longitude);

    const moonEvents = [
      ['moonrise', result.moonRises],
      ['moonset', result.moonSets],
    ] as const;
    for (const [name, actual] of moonEvents) {
      const expected = fixture.events[name];

      it(`${name} matches within ±${TOLERANCE_MINUTES} minutes`, () => {
        expect(actual).toHaveLength(expected === null ? 0 : 1);
        if (expected !== null) {
          expect(minutesBetween(actual[0]!, expected.dateTime)).toBeLessThanOrEqual(TOLERANCE_MINUTES);
        }
      });
    }

    const sunEvents = [
      ['sunrise', result.sunRise],
      ['sunset', result.sunSet],
    ] as const;
    for (const [name, actual] of sunEvents) {
      const expected = fixture.events[name];
      if (expected === null) continue;

      it(`${name} matches within ±${TOLERANCE_MINUTES} minutes`, () => {
        expect(actual).not.toBeNull();
        expect(minutesBetween(actual!, expected.dateTime)).toBeLessThanOrEqual(TOLERANCE_MINUTES);
      });
    }
  });
}

describe('daylight saving time', () => {
  it('2026-03-08, a 23-hour day, has no moonrise', () => {
    const date = Temporal.PlainDate.from('2026-03-08');
    expect(date.toZonedDateTime({ timeZone: timezone }).hoursInDay).toBe(23);

    const result = calculateDayEvents(date, timezone, latitude, longitude);
    expect(result.moonRises).toHaveLength(0);
    expect(result.moonSets).toHaveLength(1);
  });

  it('2026-11-01, a 25-hour day, keeps its events in local time', () => {
    const date = Temporal.PlainDate.from('2026-11-01');
    expect(date.toZonedDateTime({ timeZone: timezone }).hoursInDay).toBe(25);

    const result = calculateDayEvents(date, timezone, latitude, longitude);
    // Both fall after the 02:00 fall back, on standard time
    expect(result.moonRises[0]?.offset).toBe('-08:00');
    expect(result.moonSets[0]?.offset).toBe('-08:00');
  });
});

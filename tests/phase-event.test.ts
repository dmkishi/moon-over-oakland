/**
 * Verifies `calculatePhaseEvent()`'s posting decisions, the phase instants they
 * rest on, and the four next-phase lookups each post carries, against every
 * principal phase of 2026.
 *
 * Posting rules and JPL Horizons instants at
 * `./fixtures/phase-event.posting.jsonc`.
 */
import { describe, it, expect } from 'vitest';
import { Temporal } from 'temporal-polyfill/implementation';
import { postingFixtures, type PostingFixture } from './fixtures/helpers.ts';
import { PHASE_TYPES, type PhaseType } from '../src/ephemeris/phase.ts';
import type { MoonEvent } from '../src/event-delta.ts';
import { observer } from '../src/observer.ts';
import { calculatePhaseEvent, type PhaseEvent } from '../src/phase-event.ts';

/**
 * `astronomia/moonphase` agrees with Horizons to within 11 s across all 50
 * phases of 2026, so a minute is ~5x margin.
 */
const TOLERANCE_SECONDS = 60;

const { timezone, latitude, longitude } = observer;

/**
 * Called per test, not hoisted into the `describe` body: a hoisted call runs at
 * collection time, where a throw fails the whole file and the work happens even
 * under a filter that excludes it. Recomputing costs tens of milliseconds.
 */
function calculate(date: Temporal.PlainDate): PhaseEvent | null {
  return calculatePhaseEvent(date, timezone, latitude, longitude);
}

function secondsBetween(a: Temporal.ZonedDateTime, isoDateTime: string): number {
  return Math.abs(a.epochMilliseconds - new Date(isoDateTime).getTime()) / 1_000;
}

function postDateOf(fixture: PostingFixture): Temporal.PlainDate {
  const eventDate = Temporal.PlainDate.from(fixture.eventDate);
  return fixture.post === 'prev' ? eventDate.subtract({ days: 1 }) : eventDate;
}

/** The instant `calculatePhaseEvent` passes to `findNextPhases`. */
function windowEnd(postDate: Temporal.PlainDate): Temporal.ZonedDateTime {
  return postDate.add({ days: 1 }).toZonedDateTime({ timeZone: timezone, plainTime: '04:00' });
}

/**
 * A copy of `REFERENCES` in `event-delta.ts` so they cannot drift together.
 */
const REFERENCES: Record<PhaseType, Record<MoonEvent, string>> = {
  'new': {
    moonrise: 'sunrise',
    moonset: 'sunset',
  },
  'first-quarter': {
    moonrise: 'noon',
    moonset: 'midnight',
  },
  'full': {
    moonrise: 'sunset',
    moonset: 'sunrise',
  },
  'last-quarter': {
    moonrise: 'midnight',
    moonset: 'noon',
  },
};

/*******************************************************************************
 * Test posting decisions
 ******************************************************************************/
for (const fixture of postingFixtures) {
  const eventDate = Temporal.PlainDate.from(fixture.eventDate);
  const postDate = postDateOf(fixture);

  describe(`${fixture.phaseType} on ${fixture.eventDate} (${fixture.post})`, () => {
    it(`posts on ${postDate}`, () => {
      const result = calculate(postDate);
      expect(result).not.toBeNull();
      expect(result!.type).toBe(fixture.phaseType);
      expect(result!.day).toBe(fixture.post === 'same' ? 'today' : 'tomorrow');
      expect(result!.time.toPlainDate().equals(eventDate)).toBe(true);
    });

    it(`matches the Horizons instant within ${TOLERANCE_SECONDS} seconds`, () => {
      const result = calculate(postDate);
      expect(secondsBetween(result!.time, fixture.dateTime)).toBeLessThanOrEqual(
        TOLERANCE_SECONDS,
      );
    });

    it('does not count its own phase as next', () => {
      const result = calculate(postDate);
      const nextOfSameType = result!.nextPhases[fixture.phaseType];
      expect(Temporal.ZonedDateTime.compare(nextOfSameType, result!.time)).toBe(1);
    });

    it('does not post on adjacent days', () => {
      expect(calculate(postDate.subtract({ days: 1 }))).toBeNull();
      expect(calculate(postDate.add({ days: 1 }))).toBeNull();
    });

    it('calculates the sun and moon times for the post date', () => {
      const sunriseDate = calculate(postDate)!.dayEvents.sunrise.toPlainDate();
      expect(sunriseDate.toString()).toBe(postDate.toString());
    });

    it(`reads its deltas against a ${fixture.phaseType} moon's references`, () => {
      const { moonrise, moonset } = REFERENCES[fixture.phaseType];
      const { eventDeltas } = calculate(postDate)!;
      expect(eventDeltas.moonrise.reference).toBe(moonrise);
      expect(eventDeltas.moonset.reference).toBe(moonset);
    });
  });
}

/*******************************************************************************
 * Test next phase instants
 ******************************************************************************/
/**
 * Every post carries all four `nextPhases`, but the loop above only ever reads
 * the one matching the event's own type. These cases below read the other three
 * too, so a `findNextPhases` that returns the right kind of phase a whole
 * lunation late no longer passes.
 *
 * The fixture is the oracle. It is grouped by type and chronological within
 * each group, so the first entry of a type past the window end is the answer.
 * Filtering strictly after the window end also drops the event's own phase,
 * which lies inside the window by construction.
 */
interface NextPhaseCase {
  postDate: string;
  phaseType: PhaseType;
  expected: string;
}

function nextFixture(phaseType: PhaseType, after: number): PostingFixture | undefined {
  return postingFixtures.find(
    (fixture) => fixture.phaseType === phaseType && new Date(fixture.dateTime).getTime() > after,
  );
}

const nextPhaseCases: NextPhaseCase[] = postingFixtures.flatMap((fixture) => {
  const postDate = postDateOf(fixture);
  const after = windowEnd(postDate).epochMilliseconds;

  return PHASE_TYPES.flatMap((phaseType) => {
    // Skipped when the next phase of this type falls in 2027, past the end of
    // the fixture. Only December 2026 post dates reach that.
    const next = nextFixture(phaseType, after);
    return next ? [{ postDate: postDate.toString(), phaseType, expected: next.dateTime }] : [];
  });
});

/**
 * 50 post dates times 4 types, minus the 10 slots for December 2026. Pinned so
 * a broken `nextFixture` fails loudly rather than generating an empty suite.
 */
const NEXT_PHASE_CASES = 190;

describe('nextPhases', () => {
  it(`covers ${NEXT_PHASE_CASES} of the fixture's 200 slots`, () => {
    expect(nextPhaseCases).toHaveLength(NEXT_PHASE_CASES);
  });

  it.each(nextPhaseCases)(
    'on $postDate the next $phaseType is $expected',
    ({ postDate, phaseType, expected }) => {
      const result = calculate(Temporal.PlainDate.from(postDate))!;
      expect(secondsBetween(result.nextPhases[phaseType], expected))
        .toBeLessThanOrEqual(TOLERANCE_SECONDS);
    },
  );
});

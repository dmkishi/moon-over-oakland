/**
 * Verifies `calculatePhaseEvent()`'s posting decisions, the phase instants they
 * rest on, and the four next-phase lookups each post carries, against every
 * principal phase of 2026.
 *
 * Posting rules and JPL Horizons instants at
 * `./fixtures/phase-event.posting.jsonc`.
 */
import { describe, it, expect } from 'vitest';
import { phaseEventFixtures, type PhaseEventFixture } from './fixtures/index.ts';
import { PHASE_TYPES, type PhaseType } from '../src/ephemeris/phase.ts';
import type { MoonEvent } from '../src/event-delta.ts';
import { observer } from '../src/observer.ts';
import { calculatePhaseEvent, postOn } from './support/observer.ts';
import { REFERENCES } from './support/references.ts';
import { postDateOf } from './support/time.ts';

/**
 * `astronomia/moonphase` agrees with Horizons to within 11 s across all 50
 * phases of 2026, so a minute is ~5x margin.
 */
const TOLERANCE = { seconds: 60 };

const { timezone } = observer;

/** The instant `calculatePhaseEvent` passes to `findNextPhases`. */
function windowEnd(postDate: Temporal.PlainDate): Temporal.ZonedDateTime {
  return postDate.add({ days: 1 }).toZonedDateTime({ timeZone: timezone, plainTime: '04:00' });
}

const QUARTER_PAIRINGS: Partial<Record<PhaseType, { moonEvent: MoonEvent; noonOffset: number }>> = {
  'first-quarter': { moonEvent: 'moonset', noonOffset: 0 },
  'last-quarter': { moonEvent: 'moonrise', noonOffset: -1 },
};

/*******************************************************************************
 * Test posting decisions
 ******************************************************************************/
for (const fixture of phaseEventFixtures) {
  const eventDate = Temporal.PlainDate.from(fixture.dateTime);
  const postDate = postDateOf(fixture);

  describe(`${fixture.phaseType} on ${eventDate.toString()} (${fixture.post})`, () => {
    it(`posts on ${postDate.toString()}`, () => {
      const result = postOn(postDate);
      expect(result.type).toBe(fixture.phaseType);
      expect(result.day).toBe(fixture.post === 'same' ? 'today' : 'tomorrow');
      expect(result.time.toPlainDate().equals(eventDate)).toBe(true);
    });

    it(`matches the Horizons instant within ${TOLERANCE.seconds} seconds`, () => {
      expect(postOn(postDate).time).toBeWithin(fixture.dateTime, TOLERANCE);
    });

    it('does not count its own phase as next', () => {
      const result = postOn(postDate);
      const nextOfSameType = result.nextPhases[fixture.phaseType];
      expect(Temporal.ZonedDateTime.compare(nextOfSameType, result.time)).toBe(1);
    });

    it('does not post on adjacent days', () => {
      expect(calculatePhaseEvent(postDate.subtract({ days: 1 }))).toBeNull();
      expect(calculatePhaseEvent(postDate.add({ days: 1 }))).toBeNull();
    });

    it('calculates the sun and moon times for the post date', () => {
      const sunriseDate = postOn(postDate).dayEvents.sunrise.toPlainDate();
      expect(sunriseDate.toString()).toBe(postDate.toString());
    });

    it(`reads its deltas against a ${fixture.phaseType} moon's references`, () => {
      const { moonrise, moonset } = REFERENCES[fixture.phaseType];
      const { eventDeltas } = postOn(postDate);
      expect(eventDeltas.moonrise.reference).toBe(moonrise);
      expect(eventDeltas.moonset.reference).toBe(moonset);
    });

    // Checks that the near-midnight event (first quarter's moonset, last
    // quarter's moonrise) comes from the right midnight. The delta can't show
    // this: it's measured to whichever midnight is closest, so an event from
    // the wrong night still gets a small delta, e.g. -30 min instead of +20 min.
    const pairing = QUARTER_PAIRINGS[fixture.phaseType];
    if (pairing) {
      it(`pairs the ${pairing.moonEvent} within the noon-to-noon span around its midnight`, () => {
        const { moonEvent, noonOffset } = pairing;
        const time = postOn(postDate).dayEvents[moonEvent];
        const start = postDate.add({ days: noonOffset }).toZonedDateTime({ timeZone: timezone, plainTime: '12:00' });
        const end = start.toPlainDate().add({ days: 1 }).toZonedDateTime({ timeZone: timezone, plainTime: '12:00' });
        expect(Temporal.ZonedDateTime.compare(time, start)).toBeGreaterThanOrEqual(0);
        expect(Temporal.ZonedDateTime.compare(time, end)).toBe(-1);
      });
    }
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

function nextFixture(phaseType: PhaseType, after: number): PhaseEventFixture | undefined {
  return phaseEventFixtures.find(
    (fixture) => fixture.phaseType === phaseType && new Date(fixture.dateTime).getTime() > after,
  );
}

const nextPhaseCases: NextPhaseCase[] = phaseEventFixtures.flatMap((fixture) => {
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
      const { nextPhases } = postOn(Temporal.PlainDate.from(postDate));
      expect(nextPhases[phaseType]).toBeWithin(expected, TOLERANCE);
    },
  );
});

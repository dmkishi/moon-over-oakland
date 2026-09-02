import { describe, it, expect } from 'vitest';
import { Temporal } from 'temporal-polyfill/implementation';
import { calculateEventDeltas } from '../src/event-delta.ts';
import type { DayEvents } from '../src/ephemeris/day-events.ts';
import type { PhaseType } from '../src/ephemeris/phase.ts';
import { observer } from '../src/observer.ts';

const NON_DST_DAY = {
  moonrise: '2026-09-15T12:00',
  moonset: '2026-09-15T23:00',
  sunrise: '2026-09-15T06:53',
  sunset: '2026-09-15T19:20',
};

const { timezone } = observer;

function zoned(dateTime: string): Temporal.ZonedDateTime {
  return Temporal.PlainDateTime.from(dateTime).toZonedDateTime(timezone);
}

function dayEvents(times: Record<keyof DayEvents, string>): DayEvents {
  return {
    moonrise: zoned(times.moonrise),
    moonset: zoned(times.moonset),
    sunrise: zoned(times.sunrise),
    sunset: zoned(times.sunset),
  };
}

/**
 * Assert that each phase type reads its moonrise and moonset against the
 * correct references. E.g. A full moon should compare (or reference) its rise
 * against sunset and its set against sunrise.
 *
 * See `docs/posting-algorithm.md`.
 *
 * Only the reference labels are asserted here; where each reference instant
 * lands is covered below.
 */
describe('reference pairing', () => {
  /**
   * A copy of `REFERENCES` in `event-delta.ts` so they cannot drift together.
   */
  const REFERENCES: Record<PhaseType, { moonrise: string; moonset: string }> = {
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

  for (const phaseType of Object.keys(REFERENCES) as PhaseType[]) {
    const { moonrise: riseReference, moonset: setReference } = REFERENCES[phaseType];

    it(`a ${phaseType} moon reads its rise against ${riseReference} and its set against ${setReference}`, () => {
      const eventDeltas = calculateEventDeltas(dayEvents(NON_DST_DAY), phaseType);
      expect(eventDeltas.moonrise.reference).toBe(riseReference);
      expect(eventDeltas.moonset.reference).toBe(setReference);
      expect(eventDeltas.moonrise.moonEvent).toBe('moonrise');
      expect(eventDeltas.moonset.moonEvent).toBe('moonset');
    });
  }
});

describe('sign and magnitude', () => {
  it('is positive when the moon event is after the reference event', () => {
    const events = dayEvents({ ...NON_DST_DAY, moonrise: '2026-09-15T12:20' });
    expect(calculateEventDeltas(events, 'first-quarter').moonrise.minutes).toBe(20);
  });

  it('is negative when the moon event is before the reference event', () => {
    const events = dayEvents({ ...NON_DST_DAY, moonrise: '2026-09-15T11:20' });
    expect(calculateEventDeltas(events, 'first-quarter').moonrise.minutes).toBe(-40);
  });

  it('is zero when the moon event is the same as the reference event', () => {
    const events = dayEvents({ ...NON_DST_DAY, moonrise: '2026-09-15T06:53' });
    expect(calculateEventDeltas(events, 'new').moonrise.minutes).toBe(0);
  });

  it('measures a sun reference to the minute', () => {
    const events = dayEvents({ ...NON_DST_DAY, moonset: '2026-09-15T18:45' });
    expect(calculateEventDeltas(events, 'new').moonset.minutes).toBe(-35);
  });
});

describe('midnight', () => {
  it('reads a late-night rise against the following midnight', () => {
    const events = dayEvents({ ...NON_DST_DAY, moonrise: '2026-09-15T23:55' });
    expect(calculateEventDeltas(events, 'last-quarter').moonrise.minutes).toBe(-5);
  });

  it('reads an after-midnight rise against the midnight it just passed', () => {
    const events = dayEvents({ ...NON_DST_DAY, moonrise: '2026-09-15T00:05' });
    expect(calculateEventDeltas(events, 'last-quarter').moonrise.minutes).toBe(5);
  });
});

describe('a full moon setting the next morning', () => {
  it('carries sunrise forward onto the moonset\'s own day', () => {
    const events = dayEvents({
      moonrise: '2026-09-15T19:33',
      moonset: '2026-09-16T06:21',
      sunrise: '2026-09-15T06:53',
      sunset: '2026-09-15T19:20',
    });
    // It would be a full day off if referenced against the same day's 6:53 AM.
    expect(calculateEventDeltas(events, 'full').moonset.minutes).toBe(-32);
  });

  it('leaves a same-day reference where it is', () => {
    const events = dayEvents({ ...NON_DST_DAY, moonset: '2026-09-15T19:52' });
    expect(calculateEventDeltas(events, 'new').moonset.minutes).toBe(32);
  });
});

describe('daylight saving time', () => {
  it('shifts sunrise by a calendar day, holding its clock time across spring forward', () => {
    const events = dayEvents({
      moonrise: '2026-03-07T18:10',
      moonset: '2026-03-08T07:05',
      sunrise: '2026-03-07T06:20',
      sunset: '2026-03-07T18:05',
    });
    expect(events.sunrise.offset).toBe('-08:00');
    expect(events.moonset.offset).toBe('-07:00');

    // moonset - sunrise = 7:05 AM PDT - 6:20 AM PDT = 45 minutes.
    //
    // Adding 24 hours would land the sunrise reference on 7:20 AM instead:
    //   7:05 AM PDT - 7:20 AM PDT = -15 minutes.
    expect(calculateEventDeltas(events, 'full').moonset.minutes).toBe(45);
  });

  // The nearer midnight is decided by elapsed hours, not clock time, so the
  // hour the transition adds or removes moves the split off 12:00 — and moves
  // it the opposite way from the day's length: the 23-hour day splits later on
  // the clock, the 25-hour day earlier.
  it('splits a 23-hour day at 12:30, not 12:00', () => {
    const date = Temporal.PlainDate.from('2026-03-08');
    expect(date.toZonedDateTime({ timeZone: timezone }).hoursInDay).toBe(23);

    const events = dayEvents({
      moonrise: '2026-03-08T12:15',
      moonset: '2026-03-08T23:30',
      sunrise: '2026-03-08T07:18',
      sunset: '2026-03-08T19:06',
    });
    // Spring forward already took an hour out, so only 11h15m has elapsed —
    // short of the 11h30m midpoint, leaving the preceding midnight the nearer
    // one. A fixed 12:00 split would have read it against the following one.
    expect(calculateEventDeltas(events, 'last-quarter').moonrise.minutes).toBe(675);
  });

  it('splits a 25-hour day at 11:30, not 12:00', () => {
    const date = Temporal.PlainDate.from('2026-11-01');
    expect(date.toZonedDateTime({ timeZone: timezone }).hoursInDay).toBe(25);

    const events = dayEvents({
      moonrise: '2026-11-01T11:45',
      moonset: '2026-11-01T23:30',
      sunrise: '2026-11-01T07:29',
      sunset: '2026-11-01T18:07',
    });
    // Fall back already put an hour in, so 12h45m has elapsed — past the
    // 12h30m midpoint, making the following midnight the nearer one, 12h15m
    // off. A fixed 12:00 split would have read it against the preceding one.
    expect(calculateEventDeltas(events, 'last-quarter').moonrise.minutes).toBe(-735);
  });
});

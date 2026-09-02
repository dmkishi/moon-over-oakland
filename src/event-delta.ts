/**
 * How far a day's moonrise and moonset fall from the reference times their
 * phase is judged against: editorial policy transcribed from `docs/posting-algorithm.md`,
 * not ephemeris.
 */
import { Temporal } from 'temporal-polyfill/implementation';
import type { DayEvents } from './ephemeris/day-events.ts';
import type { PhaseType } from './ephemeris/phase.ts';
import { MINUTE_MS } from './time.ts';

export type MoonEvent = 'moonrise' | 'moonset';
type Reference = 'sunrise' | 'sunset' | 'noon' | 'midnight';

export interface EventDelta {
  minutes: number;
  moonEvent: MoonEvent;
  reference: Reference;
}

/**
 * Each principal phase or phase type (e.g. first quarter, full moon, etc.) is
 * characterized by a different pair of reference times: a new moon rises near
 * sunrise and sets near sunset, a first quarter rises around noon and sets
 * around midnight, etc.
 *
 * See `docs/posting-algorithm.md`.
 */
const REFERENCES: Record<PhaseType, Record<MoonEvent, Reference>> = {
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

/**
 * Move a reference onto the moon event's own civil day, keeping its local clock
 * time.
 *
 * Only a full moon needs this: it sets the morning *after* it rose, so the day's
 * own sunrise is a day behind it. Calendar arithmetic, not +24 h, holds the
 * clock time fixed across a DST shift. The result stands in for the next day's
 * true sunrise, which differs from the day's own by a minute or two at this
 * latitude — negligible against deltas read in quarter hours.
 */
function alignToDay(
  reference: Temporal.ZonedDateTime,
  moonEvent: Temporal.ZonedDateTime,
): Temporal.ZonedDateTime {
  const referenceDay = reference.toPlainDate();
  const moonEventDay = moonEvent.toPlainDate();
  const dayOffset = moonEventDay.since(referenceDay).days;
  return reference.add({ days: dayOffset });
}

/**
 * Resolve a reference to the instant the moon event is measured against. Each
 * one is placed relative to the event itself, not to the nominal day of
 * `events`.
 *
 * - NOON is noon on the event's own day.
 * - MIDNIGHT is whichever midnight is nearest, so a moonrise at 23:48 is read
 *   against the start of the *following* day, a 12-minute delta rather than one
 *   of nearly a full day.
 * - SUNRISE and SUNSET are the day's own, carried forward a day when the moon
 *   event lands on the next civil day (see `alignToDay`).
 */
function referenceTime(
  reference: Reference,
  moonEvent: Temporal.ZonedDateTime,
  events: DayEvents,
): Temporal.ZonedDateTime {
  switch (reference) {
    case 'sunrise':
      return alignToDay(events.sunrise, moonEvent);
    case 'sunset':
      return alignToDay(events.sunset, moonEvent);
    case 'noon':
      return moonEvent.withPlainTime('12:00');
    case 'midnight':
      // Rounding, not `startOfDay`, splits 23- and 25-hour DST days by their
      // real length rather than at a fixed 12:00.
      return moonEvent.round({ smallestUnit: 'day', roundingMode: 'halfExpand' });
  }
}

export function calculateEventDeltas(
  events: DayEvents,
  phaseType: PhaseType,
): Record<MoonEvent, EventDelta> {
  const references = REFERENCES[phaseType];

  const eventDelta = (moonEvent: MoonEvent): EventDelta => {
    const time = events[moonEvent];
    const reference = references[moonEvent];
    const referenceInstant = referenceTime(reference, time, events);
    return {
      minutes: Math.round((time.epochMilliseconds - referenceInstant.epochMilliseconds) / MINUTE_MS),
      moonEvent,
      reference,
    };
  };

  return {
    moonrise: eventDelta('moonrise'),
    moonset: eventDelta('moonset'),
  };
}

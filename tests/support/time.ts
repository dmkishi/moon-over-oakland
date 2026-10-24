import { observer } from '../../src/observer.ts';
import type { PhaseEventFixture } from '../fixtures/index.ts';

/**
 * The day a phase event fixture is posted on: the day of its instant, or the
 * day before.
 */
export function postDateOf(fixture: PhaseEventFixture): Temporal.PlainDate {
  const eventDate = Temporal.PlainDate.from(fixture.dateTime);
  return fixture.post === 'prev' ? eventDate.subtract({ days: 1 }) : eventDate;
}

/**
 * The length of `date`'s civil day at the observer, 23 or 25 on the days
 * daylight saving time begins or ends.
 */
export function hoursInDay(date: Temporal.PlainDate): number {
  return date.toZonedDateTime({ timeZone: observer.timezone }).hoursInDay;
}

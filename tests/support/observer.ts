/**
 * The `src/` calculators bound to `observer`, so a test passes only the date.
 *
 * Call these per test, not hoisted into a `describe` body: a hoisted call runs
 * at collection time, where a throw fails the whole file and the work happens
 * even under a filter that excludes it. Recomputing costs tens of milliseconds.
 */
import * as dayEvents from '../../src/ephemeris/day-events.ts';
import type { DayEvents, MoonriseWindow } from '../../src/ephemeris/day-events.ts';
import { observer } from '../../src/observer.ts';
import * as phaseEvent from '../../src/phase-event.ts';
import type { PhaseEvent } from '../../src/phase-event.ts';

const { timezone, latitude, longitude } = observer;

/**
 * `calculateDayEvents()` at the observer.
 */
export function calculateDayEvents(date: Temporal.PlainDate, moonriseWindow?: MoonriseWindow): DayEvents {
  return dayEvents.calculateDayEvents(date, timezone, latitude, longitude, moonriseWindow);
}

/**
 * `calculatePhaseEvent()` at the observer.
 */
export function calculatePhaseEvent(date: Temporal.PlainDate): PhaseEvent | null {
  return phaseEvent.calculatePhaseEvent(date, timezone, latitude, longitude);
}

/**
 * The post for `date`, which must be a posting day.
 *
 * @throws If `date` has no post
 */
export function postOn(date: Temporal.PlainDate): PhaseEvent {
  const post = calculatePhaseEvent(date);
  if (post === null) throw new Error(`No post on ${date.toString()}`);
  return post;
}

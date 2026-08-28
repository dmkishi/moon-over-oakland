import { Temporal } from '@js-temporal/polyfill';
import { JDEToJulianYear } from 'astronomia/base';
import { JDEToDate, DateToJDE } from 'astronomia/julian';
import { newMoon, first, full, last } from 'astronomia/moonphase';
import * as SunCalc from 'suncalc';

export interface PhaseEvent {
  phaseType: 'new' | 'first-quarter' | 'full' | 'last-quarter';
  eventDay: 'today' | 'tomorrow';
  events: {
    phase: Temporal.ZonedDateTime;
    moonRise: Temporal.ZonedDateTime;
    moonSet: Temporal.ZonedDateTime;
    sunRise: Temporal.ZonedDateTime;
    sunSet: Temporal.ZonedDateTime;
  }
  eventDeltas: {
    riseMinutes: number;
    setMinutes: number;
  }
  nextPhases: {
    new: Temporal.ZonedDateTime;
    firstQuarter: Temporal.ZonedDateTime;
    full: Temporal.ZonedDateTime;
    lastQuarter: Temporal.ZonedDateTime;
  }
}

/**
 * The `astronomia/moonphase` functions return the phase of their kind near a
 * decimal year, from ~10 days before it to ~20 days after.
 *
 * @example
 * ```text
 * Seeding `newMoon` w/ 2026 Aug. 25 returns Sep. 11 (+17 days)
 * Seeding `newMoon` w/ 2026 Aug. 20 returns Aug. 12 (-8 days)
 * ```
 */
type PhaseFunction = (year: number) => number;

const PHASE_FUNCTIONS: ReadonlyArray<readonly [PhaseEvent['phaseType'], PhaseFunction]> = [
  ['new', newMoon],
  ['first-quarter', first],
  ['full', full],
  ['last-quarter', last],
];

const LUNATION_YEARS = 1 / 12.3685;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

function toZoned(date: Date, timezone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timezone);
}

/**
 * Convert epoch milliseconds (JS `Date`) to decimal Julian Year.
 *
 * Julian Year is what `astronomia/moonphase` seeds on, and its years are a
 * uniform 365.25 days, so a fraction of one is a fixed span of time; adding the
 * `LUNATION_YEARS` constant (see above) steps forward by exactly one lunation,
 * whereas a calendar year's fraction would drift with leap days.
 *
 * @example
 * toJulianYear(Date.UTC(2026, 0, 1))  // 2026.0000021…
 * toJulianYear(Date.UTC(2026, 7, 25)) // 2026.6461349…
 */
function toJulianYear(epochMilliseconds: number): number {
  // Epoch milliseconds (JS `Date`) → Julian Ephemeris Day → Julian Year
  return JDEToJulianYear(DateToJDE(new Date(epochMilliseconds)));
}

/**
 * Find the given day's first moonrise and subsequent moonset even when it falls
 * on the next civil day (e.g. a full moon sets the following morning.)
 * Conversely, a day with no moonrise (infrequent, only when successive rises
 * straddle it) selects the previous day's last moonrise.
 *
 * SunCalc v2's `getMoonTimes` windows on the UTC calendar day of its argument
 * and returns at most one rise and one set, so candidates are gathered by
 * probing at absolute 24 h steps from the day's start instant. Absolute
 * offsets, not calendar arithmetic, keep the probes on distinct consecutive
 * UTC days across a DST shift; an event falls on exactly one UTC day, so
 * nothing double-counts.
 */
function findMoonRiseSetPair(
  startMs: number,
  endMs: number,
  latitude: number,
  longitude: number,
): {
  rise: Date;
  set: Date;
} {
  const rises: Date[] = [];
  const sets: Date[] = [];

  for (const offset of [-DAY_MS, 0, DAY_MS, 2 * DAY_MS]) {
    const times = SunCalc.getMoonTimes(new Date(startMs + offset), latitude, longitude);
    if (times.rise) rises.push(times.rise);
    if (times.set) sets.push(times.set);
  }

  const sortedRises = rises.sort((a, b) => a.getTime() - b.getTime());
  const sortedSets = sets.sort((a, b) => a.getTime() - b.getTime());

  const rise = sortedRises.find((d) => d.getTime() >= startMs && d.getTime() < endMs)
    ?? sortedRises.findLast((d) => d.getTime() < startMs);
  const set = rise && sortedSets.find((d) => d.getTime() > rise.getTime());

  if (!rise || !set) {
    throw new Error(`No moon rise/set pair found for the day starting ${new Date(startMs).toISOString()}`);
  }

  return {
    rise,
    set,
  };
}

/**
 * Calculate event times for the following given a plain date's civil day:
 * - moonrise
 * - moonset
 * - sunrise
 * - sunset
 */
export function calculateDayEvents(
  date: Temporal.PlainDate,
  timezone: string,
  latitude: number,
  longitude: number,
): Omit<PhaseEvent['events'], 'phase'> {
  // Calendar arithmetic, not +24h, keeps 23- and 25-hour DST days correct.
  const startMs = date.toZonedDateTime({ timeZone: timezone }).epochMilliseconds;
  const endMs = date.add({ days: 1 }).toZonedDateTime({ timeZone: timezone }).epochMilliseconds;
  const moon = findMoonRiseSetPair(startMs, endMs, latitude, longitude);

  const localNoon = date.toZonedDateTime({ timeZone: timezone, plainTime: '12:00' });
  const { sunrise, sunset } = SunCalc.getTimes(
    new Date(localNoon.epochMilliseconds),
    latitude,
    longitude,
  );
  if (!sunrise || !sunset) {
    throw new Error(`No sun rise/set pair found for ${date.toString()}`);
  }

  return {
    moonRise: toZoned(moon.rise, timezone),
    moonSet: toZoned(moon.set, timezone),
    sunRise: toZoned(sunrise, timezone),
    sunSet: toZoned(sunset, timezone),
  };
}

export function calculateEventDeltas(
  events: Omit<PhaseEvent['events'], 'phase'>,
): PhaseEvent['eventDeltas'] {
  const minutesDelta = (a: Temporal.ZonedDateTime, b: Temporal.ZonedDateTime): number =>
    Math.round((a.epochMilliseconds - b.epochMilliseconds) / MINUTE_MS);

  return {
    riseMinutes: minutesDelta(events.moonRise, events.sunRise),
    setMinutes: minutesDelta(events.moonSet, events.sunSet),
  };
}

/**
 * Find nearest phase of given type.
 *
 * Strict inequality excludes day's own phase from counting as its own "next",
 * including when its instant sits in the 00:00–04:00 tail of tomorrow.
 */
function findNextPhase(
  phaseFunction: PhaseFunction,
  after: Temporal.ZonedDateTime,
  timezone: string,
): Temporal.ZonedDateTime {
  let year = toJulianYear(after.epochMilliseconds);
  for (let attempt = 0; attempt < 3; attempt++) {
    const instant = toZoned(JDEToDate(phaseFunction(year)), timezone);
    if (Temporal.ZonedDateTime.compare(instant, after) > 0) return instant;
    year += LUNATION_YEARS;
  }
  throw new Error(`No next phase found after ${after.toString()}`);
}

/**
 * Given a plain date and observer properties, returns phase event if any occurs
 * within a window boundary, at or after 4:00 AM on the day of and before 4:00
 * AM the next day.
 */
export function calculatePhaseEvent(
  date: Temporal.PlainDate,
  timezone: string,
  latitude: number,
  longitude: number,
): PhaseEvent | null {
  // Calendar arithmetic, not +24h, keeps 23- and 25-hour DST days correct;
  // 04:00 exists unambiguously on every US transition day.
  const windowBoundary = { timeZone: timezone, plainTime: '04:00' };
  const windowStart = date.toZonedDateTime(windowBoundary);
  const windowEnd = date.add({ days: 1 }).toZonedDateTime(windowBoundary);

  // Find principal phase events from midpoint of window start and end.
  const windowMidpoint = (windowStart.epochMilliseconds + windowEnd.epochMilliseconds) / 2;
  const windowMidpointJulianYear = toJulianYear(windowMidpoint);

  for (const [phaseType, phaseFunction] of PHASE_FUNCTIONS) {
    // JDEToDate, never JDToDate: the phase functions return Terrestrial Time,
    // and only JDEToDate applies ΔT (69 s in 2026).
    const phase = toZoned(JDEToDate(phaseFunction(windowMidpointJulianYear)), timezone);
    if (
      Temporal.ZonedDateTime.compare(windowStart, phase) > 0 ||
      Temporal.ZonedDateTime.compare(phase, windowEnd) >= 0
    ) continue;

    const dayEvents = calculateDayEvents(date, timezone, latitude, longitude);

    return {
      phaseType,
      eventDay: phase.toPlainDate().equals(date) ? 'today' : 'tomorrow',
      events: {
        phase,
        ...dayEvents,
      },
      eventDeltas: calculateEventDeltas(dayEvents),
      nextPhases: {
        new: findNextPhase(newMoon, windowEnd, timezone),
        firstQuarter: findNextPhase(first, windowEnd, timezone),
        full: findNextPhase(full, windowEnd, timezone),
        lastQuarter: findNextPhase(last, windowEnd, timezone),
      },
    };
  }

  return null;
}

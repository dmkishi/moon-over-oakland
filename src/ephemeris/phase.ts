/**
 * Principal phase instants from `astronomia/moonphase`.
 */
import { Temporal } from '@js-temporal/polyfill';
import { JDEToJulianYear } from 'astronomia/base';
import { JDEToDate, DateToJDE } from 'astronomia/julian';
import { newMoon, first, full, last } from 'astronomia/moonphase';
import { toZoned } from '../time.ts';

/**
 * Ordered as the phases recur within a lunation, which is also the order
 * `calculatePhaseEvent` tries them in.
 */
export const PHASE_TYPES = ['new', 'first-quarter', 'full', 'last-quarter'] as const;

export type PhaseType = typeof PHASE_TYPES[number];

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

const PHASE_FUNCTIONS: Record<PhaseType, PhaseFunction> = {
  'new': newMoon,
  'first-quarter': first,
  'full': full,
  'last-quarter': last,
};

const LUNATION_YEARS = 1 / 12.3685;

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

function phaseAt(
  phaseType: PhaseType,
  julianYear: number,
  timezone: string,
): Temporal.ZonedDateTime {
  // JDEToDate, never JDToDate: the phase functions return Terrestrial Time,
  // and only JDEToDate applies ΔT (69 s in 2026).
  return toZoned(JDEToDate(PHASE_FUNCTIONS[phaseType](julianYear)), timezone);
}

/**
 * Find the phase of the given type nearest the given instant.
 */
export function findPhaseNear(
  phaseType: PhaseType,
  epochMilliseconds: number,
  timezone: string,
): Temporal.ZonedDateTime {
  return phaseAt(phaseType, toJulianYear(epochMilliseconds), timezone);
}

/**
 * Find nearest phase of given type.
 *
 * Strict inequality excludes day's own phase from counting as its own "next",
 * including when its instant sits in the 00:00–04:00 tail of tomorrow.
 */
function findNextPhase(
  phaseType: PhaseType,
  after: Temporal.ZonedDateTime,
  timezone: string,
): Temporal.ZonedDateTime {
  let year = toJulianYear(after.epochMilliseconds);
  for (let attempt = 0; attempt < 3; attempt++) {
    const instant = phaseAt(phaseType, year, timezone);
    if (Temporal.ZonedDateTime.compare(instant, after) > 0) return instant;
    year += LUNATION_YEARS;
  }
  throw new Error(`No next phase found after ${after.toString()}`);
}

/**
 * Find the next phase of every type after the given instant.
 */
export function findNextPhases(
  after: Temporal.ZonedDateTime,
  timezone: string,
): Record<PhaseType, Temporal.ZonedDateTime> {
  return Object.fromEntries(
    PHASE_TYPES.map((phaseType) => [phaseType, findNextPhase(phaseType, after, timezone)]),
  ) as Record<PhaseType, Temporal.ZonedDateTime>;
}

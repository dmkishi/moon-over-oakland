import { Temporal } from '@js-temporal/polyfill';
import SunCalc from 'suncalc';
import { calculateMoonDay, type MoonPhase } from './moonDay.js';

type PostingPhase = Extract<MoonPhase, 'new' | 'first-quarter' | 'full' | 'third-quarter'>;

export interface PostingDecision {
  doPost: boolean;
  phase?: PostingPhase;
  eventTime?: Date;
}

const PHASE_TARGETS: { target: number; phase: PostingPhase }[] = [
  { target: 0,    phase: 'new' },
  { target: 0.25, phase: 'first-quarter' },
  { target: 0.5,  phase: 'full' },
  { target: 0.75, phase: 'third-quarter' },
];
const PROXIMITY_THRESHOLD = 0.05;
const BINARY_SEARCH_ITERATIONS = 50;

/**
 * Evaluate whether a moon phase post should be published on the given date.
 *
 * Scans a window from 12h before midnight through 36h after for nearby phase
 * events, finds the exact event time via binary search, applies the date-
 * assignment algorithm, and returns whether the assigned date matches the input
 * date.
 */
export function evaluatePostingRule(
  date: Date,
  timezone: string,
  latitude: number,
  longitude: number,
): PostingDecision {
  const phaseAtNoon = SunCalc.getMoonIllumination(localNoon(date, timezone)).phase;
  const midnight = localMidnight(date, timezone);
  const searchStartMs = midnight.getTime() - 12 * 3_600_000;
  const searchEndMs = midnight.getTime() + 36 * 3_600_000;
  const inputDate = calendarDate(date, timezone);

  for (const { target, phase } of PHASE_TARGETS) {
    const distance = Math.abs(adjustedPhase(phaseAtNoon, target));
    if (distance > PROXIMITY_THRESHOLD) continue;

    const eventTime = findPhaseEvent(target, searchStartMs, searchEndMs);
    if (!eventTime) continue;

    const assigned = assignDate(phase, eventTime, timezone, latitude, longitude);
    if (assigned === inputDate) {
      return {
        doPost: true,
        phase,
        eventTime,
      };
    }
  }

  return {
    doPost: false,
  };
}

/**
 * Compute the signed distance from a phase value to a target, handling the
 * wraparound at phase 0/1. Result is in [-0.5, 0.5].
 */
function adjustedPhase(phase: number, target: number): number {
  let diff = phase - target;
  if (diff > 0.5) diff -= 1;
  if (diff < -0.5) diff += 1;
  return diff;
}

/**
 * Convert absolute date to the local calendar date string (YYYY-MM-DD) in the
 * given timezone.
 */
function calendarDate(date: Date, timezone: string): string {
  return Temporal.Instant
    .fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .toString();
}

/**
 * Extract the fractional hour (0-24) for a Date in the given timezone.
 */
function localHour(date: Date, timezone: string): number {
  const zdt = Temporal.Instant
    .fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(timezone);
  return zdt.hour + zdt.minute / 60 + zdt.second / 3_600;
}

/**
 * Compute midnight (start of day) for a given date in a timezone.
 */
function localMidnight(date: Date, timezone: string): Date {
  return new Date(
    Temporal.Instant
      .fromEpochMilliseconds(date.getTime())
      .toZonedDateTimeISO(timezone)
      .with({ hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 })
      .toInstant()
      .epochMilliseconds
  );
}

/**
 * Compute local noon for a given date in a timezone.
 */
function localNoon(date: Date, timezone: string): Date {
  return new Date(
    Temporal.Instant
      .fromEpochMilliseconds(date.getTime())
      .toZonedDateTimeISO(timezone)
      .with({ hour: 12, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 })
      .toInstant()
      .epochMilliseconds
  );
}

/**
 * Add or subtract calendar days from a date string.
 */
function offsetDate(dateStr: string, days: number): string {
  return Temporal.PlainDate.from(dateStr).add({ days }).toString();
}

/**
 * Binary search for the exact moment when the moon phase crosses a target
 * value within the given time window [startMs, endMs].
 *
 * Returns the Date of the crossing, or null if no crossing is found.
 */
function findPhaseEvent(
  target: number,
  startMs: number,
  endMs: number,
): Date | null {
  let lo = startMs;
  let hi = endMs;

  const loAdj = adjustedPhase(SunCalc.getMoonIllumination(new Date(lo)).phase, target);
  const hiAdj = adjustedPhase(SunCalc.getMoonIllumination(new Date(hi)).phase, target);

  // No sign change means no crossing in this interval.
  if (loAdj * hiAdj > 0) return null;

  for (let i = 0; i < BINARY_SEARCH_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const midAdj = adjustedPhase(SunCalc.getMoonIllumination(new Date(mid)).phase, target);
    if (midAdj * loAdj <= 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return new Date((lo + hi) / 2);
}

/**
 * Determine which calendar date a phase event should be assigned to.
 *
 * The algorithm uses clock-time (hour-of-day) comparisons, not absolute
 * timestamps, because the cutoff points (Q-point, uK) and events span
 * midnight boundaries.
 */
function assignDate(
  phase: PostingPhase,
  eventTime: Date,
  timezone: string,
  latitude: number,
  longitude: number,
): string {
  const eventDate = calendarDate(eventTime, timezone);

  if (phase === 'new' || phase === 'first-quarter') {
    return eventDate;
  }

  const moonDay = calculateMoonDay(eventTime, timezone, latitude, longitude);
  const eventH = localHour(eventTime, timezone);

  if (phase === 'full') {
    // Q-point = midpoint of upper culmination and moonset (in clock time)
    const oKH = localHour(moonDay.upperCulmination, timezone);
    const setH = localHour(moonDay.moonset.date, timezone);
    const qH = (oKH + setH) / 2;
    return eventH < qH
      ? offsetDate(eventDate, -1)
      : eventDate;
  }

  // Third-quarter: post on next day if event time >= lower culmination
  const uKH = localHour(moonDay.lowerCulmination, timezone);
  return eventH < uKH
    ? eventDate
    : offsetDate(eventDate, 1);
}

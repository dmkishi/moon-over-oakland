/**
 * A day's moon and sun rise/set times from SunCalc.
 */
import * as SunCalc from 'suncalc';
import { DAY_MS, toZoned } from '../time.ts';

export interface DayEvents {
  moonrise: Temporal.ZonedDateTime;
  moonset: Temporal.ZonedDateTime;
  sunrise: Temporal.ZonedDateTime;
  sunset: Temporal.ZonedDateTime;
}

/**
 * Where to look for a day's moonrise:
 * - `day`: the civil day, midnight to midnight.
 * - `night`: noon on the previous day to noon on the day, centered on the
 *   midnight that starts it. A last quarter moon up at dawn rose in this window.
 */
export type MoonriseWindow = 'day' | 'night';

/**
 * The window's bounds in epoch ms. Calendar arithmetic, not +24h, keeps 23-
 * and 25-hour DST days correct.
 *
 * @pure
 */
function moonriseWindowBounds(
  date: Temporal.PlainDate,
  timezone: string,
  moonriseWindow: MoonriseWindow,
): [startMs: number, endMs: number] {
  const [start, end] = moonriseWindow === 'day'
    ? [date.toZonedDateTime(timezone), date.add({ days: 1 }).toZonedDateTime(timezone)]
    : [
      date.subtract({ days: 1 }).toZonedDateTime({ timeZone: timezone, plainTime: '12:00' }),
      date.toZonedDateTime({ timeZone: timezone, plainTime: '12:00' }),
    ];
  return [start.epochMilliseconds, end.epochMilliseconds];
}

/**
 * Find the given window's first moonrise and subsequent moonset even when it
 * falls after the window (e.g. a full moon sets the following morning.)
 * Conversely, a window with no moonrise (infrequent, only when successive rises
 * straddle it) selects the last moonrise before it.
 *
 * SunCalc v2's `getMoonTimes` windows on the UTC calendar day of its argument
 * and returns at most one rise and one set, so candidates are gathered by
 * probing at absolute 24 h steps from the window's start instant. Absolute
 * offsets, not calendar arithmetic, keep the probes on distinct consecutive
 * UTC days across a DST shift; an event falls on exactly one UTC day, so
 * nothing double-counts.
 *
 * @pure
 */
function findMoonriseSetPair(
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

  const sortedRises = rises.toSorted((a, b) => a.getTime() - b.getTime());
  const sortedSets = sets.toSorted((a, b) => a.getTime() - b.getTime());

  const rise = sortedRises.find((d) => d.getTime() >= startMs && d.getTime() < endMs)
    ?? sortedRises.findLast((d) => d.getTime() < startMs);
  const set = rise && sortedSets.find((d) => d.getTime() > rise.getTime());

  if (!rise || !set) {
    throw new Error(`No moon rise/set pair found for the window starting ${new Date(startMs).toISOString()}`);
  }

  return {
    rise,
    set,
  };
}

/**
 * Calculate event times for the following given a plain date's civil day:
 * - moonrise, searched for in `moonriseWindow` (see `MoonriseWindow`)
 * - moonset, the first after that moonrise
 * - sunrise
 * - sunset
 *
 * @pure
 */
// oxlint-disable-next-line max-params - Observer fields plus the window
export function calculateDayEvents(
  date: Temporal.PlainDate,
  timezone: string,
  latitude: number,
  longitude: number,
  moonriseWindow: MoonriseWindow = 'day',
): DayEvents {
  const [startMs, endMs] = moonriseWindowBounds(date, timezone, moonriseWindow);
  const moon = findMoonriseSetPair(startMs, endMs, latitude, longitude);

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
    moonrise: toZoned(moon.rise, timezone),
    moonset: toZoned(moon.set, timezone),
    sunrise: toZoned(sunrise, timezone),
    sunset: toZoned(sunset, timezone),
  };
}

import type { Temporal } from '@js-temporal/polyfill';
import type { MoonEphemeris } from './client.ts';
import type { Observer, ObservingDay } from './observer.ts';
import type { PhaseEvent } from './phase-event.ts';

/**
 * A single observing day distilled from the full `MoonEphemeris` run.
 */
export interface MoonSummary {
  metadata: {
    date: string; // "YYYY-MM-DD"
    timeZone: string; // IANA, e.g. "America/Los_Angeles"
  };
  /**
   * The noon values represent an average of the Moon's illumination and
   * distance of the day.
   */
  noon: {
    illuminatedFraction: number;
    distanceKm: number;
  };
  /**
   * `null` event means it did not occur on this date (e.g. the Moon never rose.)
   */
  events: {
    phaseEvent: PhaseEvent | null;
    moonrise: { at: Temporal.ZonedDateTime; azimuthDeg: number; tiltDeg: number } | null;
    moonset: { at: Temporal.ZonedDateTime; azimuthDeg: number; tiltDeg: number } | null;
    transit: Temporal.ZonedDateTime | null;
    sunrise: Temporal.ZonedDateTime | null;
    sunset: Temporal.ZonedDateTime | null;
  };
}

function findRowNearestToNoon(rows: MoonEphemeris[], day: ObservingDay): MoonEphemeris {
  // `.with()` rather than `.add({ hours: 12 })`: on a DST day the latter lands
  // an hour off the noon wall clock.
  const noonMs = day.start.with({ hour: 12 }).epochMilliseconds;

  return rows.reduce((nearest, row) =>
    Math.abs(row.at.epochMilliseconds - noonMs) <
    Math.abs(nearest.at.epochMilliseconds - noonMs) ? row : nearest
  );
}

export function computeMoonSummary(
  rows: MoonEphemeris[],
  observer: Observer,
  day: ObservingDay,
  phaseEvent: PhaseEvent | null,
): MoonSummary {
  // Moonrise and moonset are read off the same three fields of whichever row
  // carries the flag.
  const flagEvent = (row: MoonEphemeris) => ({
    at: row.at,
    azimuthDeg: row.azimuthDeg,
    tiltDeg: row.tiltDeg,
  });

  let moonrise: MoonSummary['events']['moonrise'] = null;
  let moonset: MoonSummary['events']['moonset'] = null;
  let transit: MoonSummary['events']['transit'] = null;
  let sunrise: MoonSummary['events']['sunrise'] = null;
  let sunset: MoonSummary['events']['sunset'] = null;

  let prev: MoonEphemeris | undefined;
  for (const curr of rows) {
    if (moonrise === null && curr.flags.includes('r')) moonrise = flagEvent(curr);
    if (moonset === null && curr.flags.includes('s')) moonset = flagEvent(curr);
    if (transit === null && curr.flags.includes('t')) transit = curr.at;

    // Sun transitions: '*' flag means sun is above the horizon (daytime). The
    // first row has nothing to transition from, so it can only set `prev`.
    if (prev !== undefined) {
      if (sunrise === null && !prev.flags.includes('*') && curr.flags.includes('*')) {
        sunrise = curr.at;
      }
      if (sunset === null && prev.flags.includes('*') && !curr.flags.includes('*')) {
        sunset = curr.at;
      }
    }

    prev = curr;
  }

  const noonRow = findRowNearestToNoon(rows, day);

  return {
    metadata: {
      date: observer.date,
      timeZone: observer.timeZone,
    },
    noon: {
      illuminatedFraction: noonRow.illuminatedFraction,
      distanceKm: noonRow.distanceKm,
    },
    events: {
      moonrise,
      moonset,
      transit,
      sunrise,
      sunset,
      phaseEvent,
    },
  };
}

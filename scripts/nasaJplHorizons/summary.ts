import type { Temporal } from 'temporal-polyfill/implementation';
import { eventsAt, type MoonEphemeris } from './horizons.ts';
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

function flagEvent(row: MoonEphemeris) {
  return {
    at: row.at,
    azimuthDeg: row.azimuthDeg,
    tiltDeg: row.tiltDeg,
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
  let moonrise: MoonSummary['events']['moonrise'] = null;
  let moonset: MoonSummary['events']['moonset'] = null;
  let transit: MoonSummary['events']['transit'] = null;
  let sunrise: MoonSummary['events']['sunrise'] = null;
  let sunset: MoonSummary['events']['sunset'] = null;

  // The summary reports one of each, so the first occurrence wins and any later
  // one is dropped.
  for (const [i, row] of rows.entries()) {
    for (const name of eventsAt(row, rows[i - 1])) {
      switch (name) {
        case 'moonrise': moonrise ??= flagEvent(row); break;
        case 'moonset': moonset ??= flagEvent(row); break;
        case 'transit': transit ??= row.at; break;
        case 'sunrise': sunrise ??= row.at; break;
        case 'sunset': sunset ??= row.at; break;
        default: name satisfies never;
      }
    }
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

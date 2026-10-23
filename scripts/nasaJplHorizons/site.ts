import { observer } from '../../src/observer.ts';

/**
 * Where the Moon is watched from: the bot's observer plus the elevation that
 * Horizons needs for a topocentric table.
 */
export const SITE = {
  ...observer,
  elevationMeter: 20, // Elevation is hardcoded for now
} as const;

export type Site = typeof SITE;

/**
 * The instants bounding the observing day, `start` inclusive and `end`
 * exclusive. Derived once and threaded through the run so that every consumer
 * agrees on where the day begins and ends.
 */
export interface ObservingDay {
  start: Temporal.ZonedDateTime;
  end: Temporal.ZonedDateTime;
}

/**
 * The site's civil day on `date`. DST transition days are 23 or 25 hours long,
 * so the end is derived by calendar arithmetic rather than by adding 24 hours.
 */
export function civilDay(date: Temporal.PlainDate | string): ObservingDay {
  const start = Temporal.PlainDate.from(date).toZonedDateTime({ timeZone: SITE.timezone });
  return {
    start,
    end: start.add({ days: 1 }),
  };
}

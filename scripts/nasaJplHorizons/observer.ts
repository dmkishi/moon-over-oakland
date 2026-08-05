import { Temporal } from '@js-temporal/polyfill';

/**
 * The observing location and date for which the ephemeris is requested, i.e.
 * where and when the Moon is being watched from.
 */
export interface Observer {
  date: string; // "YYYY-MM-DD"
  timeZone: string; // IANA, e.g. "America/Los_Angeles"
  lat: number;
  lon: number;
  elevationMeter: number;
}

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
 * The observing day's true bounds. DST transition days are 23 or 25 hours long,
 * so the end is derived by calendar arithmetic rather than by adding 24 hours.
 */
export function civilDayBounds(observer: Observer): ObservingDay {
  const start = Temporal.PlainDate.from(observer.date)
    .toZonedDateTime({ timeZone: observer.timeZone });
  return { start, end: start.add({ days: 1 }) };
}

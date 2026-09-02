import { Temporal } from 'temporal-polyfill/implementation';

export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;

export function toZoned(date: Date, timezone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timezone);
}

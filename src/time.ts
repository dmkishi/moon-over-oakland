export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;

/**
 * Convert a `Date` with a given timezone to a `Temporal.ZonedDateTime`.
 * @pure
 */
export function toZoned(date: Date, timezone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timezone);
}

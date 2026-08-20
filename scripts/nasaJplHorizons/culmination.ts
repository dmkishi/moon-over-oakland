import { Temporal } from '@js-temporal/polyfill';
import type { MoonEphemeris } from './ephemeris.ts';
import type { ObservingDay } from './observer.ts';

/**
 * The lower culmination is due north, so it is the 0° meridian that the Moon's
 * azimuth crosses. Written as 360 rather than 0 because the crossing is tested
 * against the unwrapped pair below, where the later sample has been lifted past
 * the rollover.
 */
const LOWER_CULMINATION_AZIMUTH_DEG = 360;

/**
 * Find the instant of the Moon's lower culmination within the sampled day, or
 * `null` when the day holds none.
 *
 * The upper culmination is read straight off the `t`-flagged row in
 * `computeMoonSummary`, but Horizons offers no counterpart for the lower one,
 * so it is interpolated from the azimuth crossing instead.
 *
 * Successive culminations sit ~24h50m apart, so a civil day holds at most one
 * and occasionally none, e.g. 2026-09-25 has no upper culmination, falling
 * between one at 23:55 on the 24th and one at 00:39 on the 26th. The exception
 * is a 25-hour fall-back day, which is long enough to hold two; the first is
 * returned.
 *
 * @param rows - Spanning the day and one step past its end, so that a crossing
 *   in the day's final minute still has a pair to bracket it.
 */
export function findLowerCulmination(
  rows: MoonEphemeris[],
  day: ObservingDay,
): Temporal.ZonedDateTime | null {
  // A crossing landing exactly on the boundary belongs to the day it opens (the
  // closing day hands it off below), but it leaves no pair to bracket it here:
  // Horizons prints the azimuth as 0.0000 on that first row, so no later pair
  // rolls over. Claim it directly.
  const firstRow = rows[0];
  if (firstRow === undefined) return null;
  if (firstRow.azimuthDeg === 0) return firstRow.at;

  for (let i = 1; i < rows.length; i++) {
    const before = rows[i - 1]!;
    const after = rows[i]!;

    // Unwrap the 360°→0° rollover so the pair stays ascending. Apparent azimuth
    // only ever advances here — the Moon is not circumpolar at this latitude —
    // and by at most a couple of degrees per step, so a drop of more than 180°
    // can only be the rollover.
    const afterAzimuthDeg = after.azimuthDeg - before.azimuthDeg < -180
      ? after.azimuthDeg + 360
      : after.azimuthDeg;
    if (afterAzimuthDeg < LOWER_CULMINATION_AZIMUTH_DEG) continue;

    const fraction = (LOWER_CULMINATION_AZIMUTH_DEG - before.azimuthDeg) /
      (afterAzimuthDeg - before.azimuthDeg);
    // Taken from the instants rather than assumed to be the step size, so the
    // repeated and skipped hours of a DST day cannot stretch the interpolation.
    const stepNanoseconds = Number(
      after.at.epochNanoseconds - before.at.epochNanoseconds,
    );
    const at = before.at.add({ nanoseconds: Math.round(fraction * stepNanoseconds) });

    // The trailing row is the next day's first instant, so a crossing landing on
    // the boundary itself is the next day's to report. Azimuth ascends, so once
    // the first crossing falls out of the day every later one does too.
    return Temporal.ZonedDateTime.compare(at, day.end) < 0 ? at : null;
  }

  return null;
}

import { PHASE_TYPES, type PhaseType } from '../../../src/ephemeris/phase.ts';
import { wrapDeg180, wrapDeg360 } from '../angles.ts';
import { fetchColumns, type Body } from '../api.ts';
import type { ObservingDay } from '../site.ts';

/**
 * Step size for the ecliptic longitude tables, independent of the ephemeris
 * step. The Moon-Sun difference in longitude advances a near-linear
 * ~0.00847°/min, so interpolating across 10 minutes resolves a crossing to well
 * under a second.
 */
const ECLIPTIC_LONGITUDE_STEP_SIZE = '10m';

/**
 * One sample of a body's geocentric ecliptic longitude.
 *
 * Timed as an instant rather than a wall clock: the series exists to be
 * interpolated across, and only elapsed time stays monotonic through a DST
 * transition.
 */
interface EclipticLongitude {
  at: Temporal.Instant;
  lonDeg: number;
}

/**
 * Fetch a geocentric ecliptic longitude table for the Moon or Sun across the
 * observing day.
 */
async function fetchEclipticLongitudes(
  body: Body,
  day: ObservingDay,
): Promise<EclipticLongitude[]> {
  const rows = await fetchColumns(
    {
      body,
      // Phase is defined geocentrically, so the observer is Earth's center.
      site: 'geocentric',
      start: day.start,
      // Through the next day's midnight, unlike the other fetches: stopping a
      // step short would leave the last 10 minutes with nothing to interpolate
      // across.
      stop: day.end,
      stepSize: ECLIPTIC_LONGITUDE_STEP_SIZE,
    },
    ['eclipticLonDeg'],
  );

  return rows.map(({ at, values }) => ({ at, lonDeg: values.eclipticLonDeg }));
}

/**
 * The principal phase instant falling on the observing day.
 */
export interface PhaseEvent {
  at: Temporal.ZonedDateTime;
  name: PhaseType;
}

// `PHASE_TYPES` runs in lunation order, so each phase sits 90° past the last.
const PHASE_CROSSINGS = PHASE_TYPES.map((name, i) => ({ name, targetDeg: i * 90 }));

/**
 * Find the principal phase instant, if any, that falls on the observing day.
 *
 * At most one can: principal events are ~7.4 days apart. Returns `null` when the
 * day holds none, including when the interpolated crossing falls at midnight or
 * later — that instant belongs to the next civil day.
 */
function findPhaseEvent(
  moonLons: EclipticLongitude[],
  sunLons: EclipticLongitude[],
  day: ObservingDay,
): PhaseEvent | null {
  if (moonLons.length !== sunLons.length) {
    throw new Error(
      `Ecliptic longitude series differ in length: ` +
      `Moon has ${moonLons.length} rows, Sun has ${sunLons.length}.`,
    );
  }

  const dayLengthMinutes = (day.end.epochMilliseconds - day.start.epochMilliseconds) / 60_000;

  // Each sample is timed as real elapsed minutes from the start of the day
  // rather than by its wall-clock label, which is what keeps the series
  // monotonic across a DST transition.
  const series = moonLons.map((moon, i) => ({
    minutes: (moon.at.epochMilliseconds - day.start.epochMilliseconds) / 60_000,
    deltaLonDeg: wrapDeg360(moon.lonDeg - sunLons[i]!.lonDeg),
  }));

  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!;
    const curr = series[i]!;
    for (const { targetDeg, name } of PHASE_CROSSINGS) {
      // Wrapping the offset to [-180, 180) makes the 360°→0° rollover at new
      // moon need no special case: it passes through zero like any other
      // crossing.
      const prevOffset = wrapDeg180(prev.deltaLonDeg - targetDeg);
      const currOffset = wrapDeg180(curr.deltaLonDeg - targetDeg);
      // The difference in longitude increases monotonically, so a sign change
      // is always a forward crossing of this target.
      if (prevOffset < 0 && currOffset >= 0) {
        const frac = -prevOffset / (currOffset - prevOffset);
        const rawAt = prev.minutes + frac * (curr.minutes - prev.minutes);
        // Which day owns the event is a property of the true crossing, so test
        // it before quantizing. Rounding one at 23:59:42 up to midnight would
        // strand it: this day rejects it as the next day's, and the next day's
        // series begins after it, so its sign change never appears there either.
        if (rawAt >= dayLengthMinutes) return null;
        // The 10-minute interpolation resolves the crossing to well under a
        // second, so carry it as milliseconds rather than rounding away the
        // precision. Clamping keeps quantization from crossing the boundary the
        // test above just drew.
        const atMs = Math.min(Math.round(rawAt * 60_000), dayLengthMinutes * 60_000 - 1);
        // Advancing by real elapsed time lands on the correct wall clock even
        // when a transition falls between the day's start and the crossing.
        return { at: day.start.add({ milliseconds: atMs }), name };
      }
    }
  }

  return null;
}

/**
 * Resolve the observing day's principal phase event, fetching the ecliptic
 * longitude tables only when the day could plausibly hold one.
 *
 * @param illuminatedPercents - Every row's illuminated percentage, 0–100. Taken
 *   bare rather than as `MoonEphemeris[]` because that is the entirety of what
 *   the gate below inspects.
 */
export async function resolvePhaseEvent(
  day: ObservingDay,
  illuminatedPercents: number[],
): Promise<PhaseEvent | null> {
  // A principal phase falls on roughly one day in seven, and the illumination
  // already parsed for every row is enough to prove most days barren — so skip
  // the two extra requests unless the day's range reaches a band that could
  // hold an event. Each bound is the worst-case topocentric illumination *at*
  // a principal instant, so a day holding one always trips its band:
  //
  // - Full:    phase angle ≥ 6.3° with parallax, so illumination ≥ 99.70%
  // - New:     phase angle ≤ 173.7°,             so illumination ≤  0.30%
  // - Quarter: elongation is exactly 90° regardless of ecliptic latitude,
  //            so illumination lands in 49.26–51.00%
  //
  // The gate errs loose: days flanking an event fetch, find no crossing, and
  // report `null`. It decides only whether to ask, never what the answer is.
  const minIllum = Math.min(...illuminatedPercents);
  const maxIllum = Math.max(...illuminatedPercents);
  const mayHavePhaseEvent =
    maxIllum > 99 || minIllum < 1 || (minIllum <= 52 && maxIllum >= 48);

  if (!mayHavePhaseEvent) return null;

  const [moonLons, sunLons] = await Promise.all([
    fetchEclipticLongitudes('moon', day),
    fetchEclipticLongitudes('sun', day),
  ]);

  return findPhaseEvent(moonLons, sunLons, day);
}

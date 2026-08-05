import { Temporal } from '@js-temporal/polyfill';
import type { MoonPhase } from '../../src/moonPost.ts';
import { queryEclipticLongitude } from './api.ts';
import { columnIndex, parseCsvBlock, parseHorizonsDatetime } from './csv.ts';
import type { Observer, ObservingDay } from './observer.ts';

export type PhaseEventName = Extract<MoonPhase, 'new' | 'first-quarter' | 'full' | 'third-quarter'>;

/**
 * The cardinal phase instant falling on the observing day.
 */
export interface PhaseEvent {
  at: Temporal.ZonedDateTime;
  name: PhaseEventName;
}

/**
 * One sample of a body's ecliptic longitude, timed as real elapsed minutes from
 * the start of the observing day.
 *
 * Measuring from the instant rather than from a wall-clock label keeps the
 * series monotonic through a DST transition.
 */
interface EclipticLongitude {
  minutesFromDayStart: number;
  lonDeg: number;
}

function parseEclipticLongitudes(
  raw: string,
  observer: Observer,
  dayStart: Temporal.ZonedDateTime,
): EclipticLongitude[] {
  const { headers, rows } = parseCsvBlock(raw);
  const iLon = columnIndex(headers, /ObsEcLon/);

  return rows.map((cols) => ({
    minutesFromDayStart:
      (parseHorizonsDatetime(cols[0], observer.timeZone).epochMilliseconds -
        dayStart.epochMilliseconds) / 60_000,
    lonDeg: parseFloat(cols[iLon]),
  }));
}

const PHASE_CROSSINGS: { targetDeg: number; name: PhaseEventName }[] = [
  { targetDeg: 0,   name: 'new' },
  { targetDeg: 90,  name: 'first-quarter' },
  { targetDeg: 180, name: 'full' },
  { targetDeg: 270, name: 'third-quarter' },
];

/**
 * Signed distance from a target longitude, in `[-180, 180)`. Wrapping the
 * difference this way makes the 360°→0° rollover at new moon need no special
 * case: the offset simply passes through zero like any other crossing.
 */
function signedOffsetDeg(deltaLonDeg: number, targetDeg: number): number {
  return (((deltaLonDeg - targetDeg + 540) % 360 + 360) % 360) - 180;
}

/**
 * Find the cardinal phase instant, if any, that falls on the observing day.
 *
 * At most one can: cardinal events are ~7.4 days apart. Returns `null` when the
 * day holds none, including when a crossing interpolates to midnight or later,
 * which belongs to the next civil day.
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

  const series = moonLons.map((moon, i) => ({
    minutes: moon.minutesFromDayStart,
    deltaLonDeg: ((moon.lonDeg - sunLons[i].lonDeg) % 360 + 360) % 360,
  }));

  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const curr = series[i];
    for (const { targetDeg, name } of PHASE_CROSSINGS) {
      const prevOffset = signedOffsetDeg(prev.deltaLonDeg, targetDeg);
      const currOffset = signedOffsetDeg(curr.deltaLonDeg, targetDeg);
      // The difference in longitude increases monotonically, so a sign change
      // is always a forward crossing of this target.
      if (prevOffset < 0 && currOffset >= 0) {
        const frac = -prevOffset / (currOffset - prevOffset);
        const at = Math.round(prev.minutes + frac * (curr.minutes - prev.minutes));
        if (at >= dayLengthMinutes) return null;
        // Advancing by real elapsed minutes lands on the correct wall clock even
        // when a transition falls between the day's start and the crossing.
        return { at: day.start.add({ minutes: at }), name };
      }
    }
  }

  return null;
}

/**
 * Resolve the observing day's cardinal phase event, fetching the ecliptic
 * longitude tables only when the day could plausibly hold one.
 *
 * @param illuminatedFractions - Every row's illuminated fraction, 0–100. Taken
 *   bare rather than as `MoonEphemeris[]` because that is the entirety of what
 *   the gate below inspects.
 */
export async function resolvePhaseEvent(
  observer: Observer,
  day: ObservingDay,
  illuminatedFractions: number[],
): Promise<PhaseEvent | null> {
  // A cardinal phase falls on roughly one day in seven, and the illumination
  // already parsed for every row is enough to prove most days barren — so skip
  // the two extra requests unless the day's range reaches a band that could
  // hold an event. Each bound is the worst-case topocentric illumination *at*
  // a cardinal instant, so a day holding one always trips its band:
  //
  // - Full:    phase angle ≥ 6.3° with parallax, so illumination ≥ 99.70%
  // - New:     phase angle ≤ 173.7°,             so illumination ≤  0.30%
  // - Quarter: elongation is exactly 90° regardless of ecliptic latitude,
  //            so illumination lands in 49.26–51.00%
  //
  // The gate errs loose: days flanking an event fetch, find no crossing, and
  // report `null`. It decides only whether to ask, never what the answer is.
  const minIllum = Math.min(...illuminatedFractions);
  const maxIllum = Math.max(...illuminatedFractions);
  const mayHavePhaseEvent =
    maxIllum > 99 || minIllum < 1 || (minIllum <= 52 && maxIllum >= 48);

  if (!mayHavePhaseEvent) return null;

  // Stop at the next day's midnight rather than 23:59, which would leave a
  // one-minute blind spot.
  const [moonRaw, sunRaw] = await Promise.all([
    queryEclipticLongitude('moon', day.start, day.end),
    queryEclipticLongitude('sun', day.start, day.end),
  ]);

  return findPhaseEvent(
    parseEclipticLongitudes(moonRaw, observer, day.start),
    parseEclipticLongitudes(sunRaw, observer, day.start),
    day,
  );
}

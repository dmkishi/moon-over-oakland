import { brightLimbPositionAngle, wrapDeg180 } from '../angles.ts';
import {
  AU_TO_KM,
  fetchColumns,
  type ColumnName,
  type TableQuery,
  type TimeList,
} from '../api.ts';
import type { ObservingDay } from '../site.ts';

/**
 * Apparent RA/Dec, read for both the Moon and the Sun to derive the bright limb.
 */
const APPARENT_EQUATORIAL_COLUMNS = [
  'apparentRightAscensionDeg',
  'apparentDeclinationDeg',
] as const satisfies ColumnName[];

/**
 * The geocentric columns `src/ephemeris/moon-disc.ts` is checked against.
 */
const MOON_DISC_COLUMNS = [
  ...APPARENT_EQUATORIAL_COLUMNS,
  'illuminatedPercent',
  'angularDiameterArcsec',
  'subEarthLonDeg',
  'subEarthLatDeg',
  'subSolarLonDeg',
  'subSolarLatDeg',
  'axisPositionAngleDeg',
  'distanceAu',
  'phaseAngleDeg',
] as const satisfies ColumnName[];

/**
 * Horizons' geocentric view of the Moon's disc at one instant, in the units
 * and conventions of `MoonDisc` in `src/ephemeris/moon-disc.ts`.
 */
interface HorizonsMoonDisc {
  at: Temporal.Instant;
  subEarth: { lon: number; lat: number };
  subSolar: { lon: number; lat: number };
  axisPositionAngle: number;
  brightLimbPositionAngle: number;
  phaseAngle: number;
  illuminatedFraction: number;
  distanceKm: number;
  angularDiameterArcmin: number;
}

/**
 * Fixed at one hour, with no flag, to match Dial-a-Moon's hourly frames. The
 * disc changes too slowly (the phase angle moves ~0.5°/h) for a finer step to
 * show anything new.
 */
const MOON_DISC_STEP_SIZE = '1h';

/**
 * Fetch the Moon's disc as seen from Earth's center, hourly across the
 * observing day or at each of a list of instants.
 */
export async function fetchMoonDiscs(
  times: ObservingDay | TimeList,
): Promise<HorizonsMoonDisc[]> {
  const query: TableQuery = {
    body: 'moon',
    site: 'geocentric',
    ...('instants' in times
      ? times
      : {
        start: times.start,
        // Short of the next day's midnight, so the last hour is in and the
        // next day is not.
        stop: times.end.subtract({ minutes: 1 }),
        stepSize: MOON_DISC_STEP_SIZE,
      }),
  };
  const [moonRows, sunRows] = await Promise.all([
    fetchColumns(query, MOON_DISC_COLUMNS),
    fetchColumns({ ...query, body: 'sun' }, APPARENT_EQUATORIAL_COLUMNS),
  ]);

  return moonRows.map(({ at, values: moon }, i) => {
    // Both tables come back in time order, so rows pair up by index.
    const sun = sunRows[i];
    if (sun === undefined || !sun.at.equals(at)) {
      throw new Error(`No Sun row for ${at.toString()}`);
    }

    // Horizons longitudes run 0–360°, `MoonDisc` longitudes −180° to 180°.
    return {
      at,
      subEarth: { lon: wrapDeg180(moon.subEarthLonDeg), lat: moon.subEarthLatDeg },
      subSolar: { lon: wrapDeg180(moon.subSolarLonDeg), lat: moon.subSolarLatDeg },
      axisPositionAngle: moon.axisPositionAngleDeg,
      brightLimbPositionAngle: brightLimbPositionAngle(moon, sun.values),
      phaseAngle: moon.phaseAngleDeg,
      illuminatedFraction: moon.illuminatedPercent / 100,
      distanceKm: moon.distanceAu * AU_TO_KM,
      angularDiameterArcmin: moon.angularDiameterArcsec / 60,
    };
  });
}

/**
 * Round to `digits` decimal places, so the fixture holds what Horizons printed
 * rather than float noise.
 */
function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

/**
 * Prints the rows of `tests/fixtures/moon-disc.accuracy.jsonc`, one per line.
 */
export function printMoonDiscFixture(rows: { description: string; disc: HorizonsMoonDisc }[]): void {
  console.log('Fixture JSONC');
  console.log('--------------------------------------------------------------------------------');
  for (const { description, disc } of rows) {
    const fixture = {
      description,
      instant: disc.at.toString({ smallestUnit: 'second' }),
      subEarth: { lon: round(disc.subEarth.lon, 6), lat: round(disc.subEarth.lat, 6) },
      subSolar: { lon: round(disc.subSolar.lon, 6), lat: round(disc.subSolar.lat, 6) },
      axisPositionAngle: round(disc.axisPositionAngle, 4),
      brightLimbPositionAngle: round(disc.brightLimbPositionAngle, 4),
      phaseAngle: round(disc.phaseAngle, 4),
      illuminatedFraction: round(disc.illuminatedFraction, 5),
      distanceKm: round(disc.distanceKm, 1),
      angularDiameterArcmin: round(disc.angularDiameterArcmin, 4),
    };
    console.log(`  ${JSON.stringify(fixture)},`);
  }
}

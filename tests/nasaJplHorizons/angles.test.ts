import { describe, it, expect } from 'vitest';
import {
  brightLimbPositionAngle,
  moonTilt,
  wrapDeg180,
  wrapDeg360,
} from '../../scripts/nasaJplHorizons/angles.ts';
import { fetchColumns, type TableQuery } from '../../scripts/nasaJplHorizons/api.ts';
import { SITE } from '../../scripts/nasaJplHorizons/site.ts';
import { DEG } from '../support/angle.ts';
import { replayHorizons, savedResponse } from '../support/horizons.ts';

describe('wrapDeg360', () => {
  it.each([
    [0, 0],
    [359.5, 359.5],
    [360, 0],
    [725, 5],
    [-90, 270],
    [-720, 0],
  ])('wraps %d° to %d°', (deg, expected) => {
    expect(wrapDeg360(deg)).toBe(expected);
  });
});

describe('wrapDeg180', () => {
  it.each([
    [0, 0],
    [179.5, 179.5],
    // The range is half-open, so the antipode lands on the negative end.
    [180, -180],
    [-180, -180],
    [270, -90],
    [-190, 170],
  ])('wraps %d° to %d°', (deg, expected) => {
    expect(wrapDeg180(deg)).toBe(expected);
  });
});

describe('brightLimbPositionAngle', () => {
  // Position angles run north through east, so a Sun due east of the Moon
  // lights the limb at 90° and one due north at 0°.
  it.each([
    ['east', { ra: 10, dec: 0 }, 90],
    ['west', { ra: 350, dec: 0 }, 270],
    ['north', { ra: 0, dec: 10 }, 0],
    ['south', { ra: 0, dec: -10 }, 180],
  ])('points %s toward the Sun', (_direction, sun, expected) => {
    const χ = brightLimbPositionAngle(
      { apparentRightAscensionDeg: 0, apparentDeclinationDeg: 0 },
      { apparentRightAscensionDeg: sun.ra, apparentDeclinationDeg: sun.dec },
    );
    expect(χ).toBeCloseTo(expected, 9);
  });
});

/**
 * The parallactic angle from the Moon's azimuth (north through east) and
 * altitude: the same angle `moonTilt` takes from the hour angle and
 * declination, but read off the horizon, where no equator or equinox enters.
 */
function parallacticAngleFromHorizon(azimuthDeg: number, altitudeDeg: number, latitude: number): number {
  const [a, h, φ] = [azimuthDeg * DEG, altitudeDeg * DEG, latitude * DEG];
  return Math.atan2(-Math.sin(a), Math.tan(φ) * Math.cos(h) - Math.sin(h) * Math.cos(a)) / DEG;
}

/**
 * The sky capture's Moon and Sun rows, paired: what `moonTilt` is given, plus
 * the azimuth and altitude to check it against.
 */
async function skyRows() {
  replayHorizons({
    moon: savedResponse('sky-2026-02-24-moon'),
    sun: savedResponse('sky-2026-02-24-sun'),
  });
  // The replay ignores the window, so any one will do.
  const query: TableQuery = {
    body: 'moon',
    site: SITE,
    start: Temporal.ZonedDateTime.from('2026-02-24T17:30[America/Los_Angeles]'),
    stop: Temporal.ZonedDateTime.from('2026-02-24T18:59[America/Los_Angeles]'),
    stepSize: '1m',
  };
  const [moonRows, sunRows] = await Promise.all([
    fetchColumns(query, [
      'apparentRightAscensionDeg',
      'apparentDeclinationDeg',
      'azimuthDeg',
      'altitudeDeg',
      'siderealTimeHours',
    ]),
    fetchColumns({ ...query, body: 'sun' }, ['apparentRightAscensionDeg', 'apparentDeclinationDeg']),
  ]);
  return moonRows.map(({ values }, i) => ({ moon: values, sun: sunRows[i]!.values }));
}

/**
 * The largest gap across `rows` between the parallactic angle inside
 * `moonTilt` and the one the azimuth and altitude give.
 *
 * @param lstOffsetDeg - Added to sidereal time, to stand in for an RA on a
 *   different equinox
 */
function worstParallacticError(
  rows: Awaited<ReturnType<typeof skyRows>>,
  lstOffsetDeg = 0,
): number {
  const errors = rows.map(({ moon, sun }) => {
    const lstHours = moon.siderealTimeHours + lstOffsetDeg / 15;
    const tilt = moonTilt(lstHours, moon, sun, SITE.latitude);
    const q = brightLimbPositionAngle(moon, sun) - tilt;
    const expected = parallacticAngleFromHorizon(moon.azimuthDeg, moon.altitudeDeg, SITE.latitude);
    return Math.abs(wrapDeg180(q - expected));
  });
  return Math.max(...errors);
}

/**
 * `moonTilt` is the bright limb less the parallactic angle, and the bright limb
 * is checked against the disc fixture (see `./moon-disc.test.ts`), so what's
 * left to check is the parallactic angle. A frame error shows up there: the
 * hour angle is only right if RA is on the same equinox as sidereal time, and
 * an error in it is amplified as the Moon nears the zenith, which it passes
 * ~10° from in this capture.
 */
describe('moonTilt', () => {
  // Residuals ≤ 0.00003°, the rounding of the printed columns.
  it('turns by the parallactic angle that the azimuth and altitude give', async () => {
    expect(worstParallacticError(await skyRows())).toBeLessThan(0.001);
  });

  // ICRF RA against apparent sidereal time put the hour angle off by the
  // precession in RA since J2000, ~0.36° by 2026, and this check is how that
  // was found.
  it('would catch an hour angle off by the precession since J2000', async () => {
    expect(worstParallacticError(await skyRows(), 0.36)).toBeGreaterThan(1);
  });
});

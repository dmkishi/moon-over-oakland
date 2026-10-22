/**
 * The Moon's disc as seen from Earth's center at one instant: what the moon
 * image is drawn from. Geocentric throughout, with `astronomia` (Meeus) as the
 * only ephemeris, so the image is the same for every observer.
 *
 * See `docs/moon-attributes.md`.
 */
import { Coord, illuminated } from 'astronomia/base';
import vsop87Bearth from 'astronomia/data/vsop87Bearth';
import { Ecliptic } from 'astronomia/coord';
import { DateToJDE } from 'astronomia/julian';
import { physical } from 'astronomia/moon';
import { phaseAngleEquatorial } from 'astronomia/moonillum';
import { position } from 'astronomia/moonposition';
import { meanObliquity, nutation } from 'astronomia/nutation';
import { Planet } from 'astronomia/planetposition';
import { apparentEquatorialVSOP87 } from 'astronomia/solar';

/** Mean radius of the Moon, and the reference sphere of all LRO data, in km. */
export const MOON_RADIUS_KM = 1_737.4;
const AU_KM = 149_597_870.7;
const DEG = 180 / Math.PI;

const earth = new Planet(vsop87Bearth);

/**
 * Selenographic coordinates in degrees. Longitude runs −180° to 180°, positive
 * toward Mare Crisium (IAU east), which is on the right of a north-up image.
 */
export interface Selenographic {
  lon: number;
  lat: number;
}

/**
 * All angles in degrees. Position angles run 0–360°, from celestial north
 * toward celestial east (counterclockwise with north up).
 */
export interface MoonDisc {
  /** The disc's center: libration in longitude (l) and latitude (b) */
  subEarth: Selenographic;
  /** Where the Sun is overhead (l₀, b₀) */
  subSolar: Selenographic;
  /** Position angle of the Moon's north rotation pole (P) */
  axisPositionAngle: number;
  /** Position angle of the midpoint of the bright limb (χ) */
  brightLimbPositionAngle: number;
  /** Sun–Moon–Earth angle (i), ~0° at full and ~180° at new */
  phaseAngle: number;
  /** Lit fraction of the disc (k), 0–1 */
  illuminatedFraction: number;
  distanceKm: number;
  angularDiameterArcmin: number;
}

/**
 * Wrap to [0, 360).
 * @pure
 */
function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/**
 * Unit vector of a selenographic point, in the Moon's body frame: x toward
 * 0° lon, y toward 90° E, z toward the north pole.
 * @pure
 */
function toVector({ lon, lat }: Selenographic): [x: number, y: number, z: number] {
  const λ = lon / DEG;
  const φ = lat / DEG;
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
}

/**
 * Position angle of the bright limb (χ) from the subsolar point projected onto
 * the disc, then turned by the axis position angle.
 *
 * Meeus 48.5 instead takes the Sun's direction from Earth, not from the Moon,
 * which puts χ off by up to ~0.15° at the quarters. The subsolar point from
 * Meeus ch. 53 already corrects for this, and it is what the image is lit by.
 *
 * @pure
 */
function brightLimbPositionAngle(
  subEarth: Selenographic,
  subSolar: Selenographic,
  axisPositionAngle: number,
): number {
  const [vx, vy, vz] = toVector(subEarth);
  const [ux, uy, uz] = toVector(subSolar);

  // Disc axes with the Moon's north up: `up` is the pole projected onto the
  // plane of the sky, and `right` = up × view, toward selenographic east.
  const upNorm = Math.hypot(vz * vx, vz * vy, 1 - vz * vz);
  const [nx, ny, nz] = [-vz * vx / upNorm, -vz * vy / upNorm, (1 - vz * vz) / upNorm];
  const [rx, ry, rz] = [ny * vz - nz * vy, nz * vx - nx * vz, nx * vy - ny * vx];

  // Position angles open toward the left (celestial east) of a north-up disc.
  const right = ux * rx + uy * ry + uz * rz;
  const up = ux * nx + uy * ny + uz * nz;
  return normalizeDegrees(axisPositionAngle + Math.atan2(-right, up) * DEG);
}

/**
 * @pure
 */
export function moonDisc(instant: Temporal.Instant): MoonDisc {
  // Instants are UT, and Meeus works in TT, so `DateToJDE` applies ΔT.
  const jde = DateToJDE(new Date(instant.epochMilliseconds));

  // Apparent geocentric RA/Dec of the Moon: Meeus ch. 47 longitude plus
  // nutation, on the true obliquity of date.
  const { lon, lat, range: distanceKm } = position(jde);
  const [Δψ, Δε] = nutation(jde);
  const moonEquatorial = new Ecliptic(lon + Δψ, lat).toEquatorial(meanObliquity(jde) + Δε);
  const moon = new Coord(moonEquatorial.ra, moonEquatorial.dec, distanceKm);

  const sunAu = apparentEquatorialVSOP87(earth, jde);
  const sun = new Coord(sunAu.ra, sunAu.dec, sunAu.range * AU_KM);

  const phaseAngle = phaseAngleEquatorial(moon, sun);
  const [earthCoord, pRadians, sunCoord] = physical(jde, earth);
  const subEarth = { lon: earthCoord.lon * DEG, lat: earthCoord.lat * DEG };
  const subSolar = { lon: sunCoord.lon * DEG, lat: sunCoord.lat * DEG };
  const axisPositionAngle = normalizeDegrees(pRadians * DEG);

  return {
    subEarth,
    subSolar,
    axisPositionAngle,
    brightLimbPositionAngle: brightLimbPositionAngle(subEarth, subSolar, axisPositionAngle),
    phaseAngle: phaseAngle * DEG,
    illuminatedFraction: illuminated(phaseAngle),
    distanceKm,
    angularDiameterArcmin: 2 * Math.asin(MOON_RADIUS_KM / distanceKm) * DEG * 60,
  };
}

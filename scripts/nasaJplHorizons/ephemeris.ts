import { Temporal } from '@js-temporal/polyfill';
import { columnIndex, parseCsvBlock, parseHorizonsDatetime } from './csv.ts';
import type { Observer } from './observer.ts';
import { moonTilt } from './tilt.ts';

/**
 * The Moon's observer-centric ephemeris at a single instant: its apparent
 * position and appearance in the observer's sky.
 */
export interface MoonEphemeris {
  at: Temporal.ZonedDateTime; // Row instant re-expressed in the observer's zone
  /**
   * Flag legend:
   * - `*`: Sun is above the horizon (daytime)
   * - `r`: Moonrise event
   * - `m`: Refracted upper-limb of Moon on or above apparent horizon
   * - `e`: Moon elevation max (target body maximum elevation angle has occurred)
   * - `t`: Moon transit (target body at or passed through observer meridian)
   * - `s`: Moonset event
   */
  flags: string[];
  azimuthDeg: number; // Apparent azimuth of the Moon
  altitudeDeg: number; // Apparent altitude of the Moon
  illuminatedFraction: number; // Illuminated fraction (0–100)
  distanceKm: number;
  tiltDeg: number; // Tilt of the moon (relative to the local vertical)
}

const AU_TO_KM = 149_597_870.7;

/**
 * Parse a `queryMoonEphemeris` response into one `MoonEphemeris` per step,
 * resolving each quantity by header name rather than by position.
 *
 * Right ascension, declination and sidereal time are consumed here rather than
 * carried forward: they exist only to derive `tiltDeg`.
 */
export function parseMoonEphemeris(raw: string, observer: Observer): MoonEphemeris[] {
  const { headers, rows } = parseCsvBlock(raw);

  // Collect flag columns, identified by empty headers.
  const flagIndices = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h === '')
    .map(({ i }) => i);

  const iRA = columnIndex(headers, /R.A._\(ICRF\)/); // Right ascension of the Moon
  const iDEC = columnIndex(headers, /DEC_\(ICRF\)/); // Declination of the Moon
  const iAZ = columnIndex(headers, /Azi_\(a-app\)/); // Apparent azimuth of the Moon
  const iEL = columnIndex(headers, /Elev_\(a-app\)/); // Apparent elevation (altitude) of the Moon
  const iLST = columnIndex(headers, /L_Ap_Sid_Time/); // Local apparent sidereal time
  const iIllum = columnIndex(headers, /Illu%/); // Illuminated fraction of the Moon
  const iDelta = columnIndex(headers, /^delta$/i); // Distance in AU
  const iPsAng = columnIndex(headers, /PsAng/); // Position angle of the Sun w/r/t to the Moon

  return rows.map((cols) => {
    return {
      at: parseHorizonsDatetime(cols[0], observer.timeZone),
      flags: flagIndices.map(i => cols[i]).filter(f => f !== ''),
      azimuthDeg: parseFloat(cols[iAZ]),
      altitudeDeg: parseFloat(cols[iEL]),
      illuminatedFraction: parseFloat(cols[iIllum]),
      distanceKm: parseFloat(cols[iDelta]) * AU_TO_KM,
      tiltDeg: moonTilt(
        parseFloat(cols[iLST]),
        parseFloat(cols[iRA]),
        parseFloat(cols[iDEC]),
        observer.lat,
        parseFloat(cols[iPsAng]),
      ),
    };
  });
}

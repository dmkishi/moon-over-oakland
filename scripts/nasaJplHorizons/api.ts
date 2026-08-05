import { Temporal } from '@js-temporal/polyfill';
import type { Observer } from './observer.ts';

/**
 * Calls the NASA JPL Horizons API and returns the raw text response.
 */
async function fetchHorizons(params: Record<string, string>): Promise<string> {
  const query = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${query}`;
  console.log(`Calling <${url}>`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Horizons API error: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/**
 * Converts a zoned instant to a Horizons-acceptable "YYYY-MM-DD HH:MM" string
 * in UT clock time.
 *
 * Ex.
 * Midnight in Oakland on 2026-03-08 is 8:00 UT, so the output is "2026-03-08 08:00".
 */
function toHorizonsUtc(zdt: Temporal.ZonedDateTime): string {
  return zdt.toInstant()
    .toZonedDateTimeISO('UTC')
    .toPlainDateTime()
    .toString({ smallestUnit: 'minute' })
    .replace('T', ' ');
}

/**
 * Fetches the Moon's topocentric, observer-centric ephemeris and returns the
 * raw text response.
 *
 * `TIME_ZONE` is omitted because, as a fixed offset, it cannot express the 23-
 * and 25-hour civil days that a DST transition produces. Instead, the window
 * (i.e. `startTime` and `stopTime`) as well as every row label in the response
 * are UT and the observer's zone is applied per row in `parseHorizonsDatetime`.
 *
 * @param start - Window start; converted to UT here (see `toHorizonsUtc`)
 * @param stop - Window end, likewise
 */
export async function queryMoonEphemeris(
  observer: Observer,
  start: Temporal.ZonedDateTime,
  stop: Temporal.ZonedDateTime,
  stepSize: string,
): Promise<string> {
  return fetchHorizons({
    format: 'text', // `json` merely wraps the text content in a JSON object
    CSV_FORMAT: "'YES'", // Request CSV output for easier parsing
    COMMAND: "'301'", // Request the Moon as target body
    OBJ_DATA: "'NO'", // Suppress extra object info in output
    MAKE_EPHEM: "'YES'", // Request ephemeris output (this is what we need)
    EPHEM_TYPE: "'OBSERVER'", // Topocentric observer-table ephemeris
    CENTER: "'coord@399'", // Earth
    COORD_TYPE: "'GEODETIC'", // Geodetic coordinates (lat/lon/elev) for observer location
    SITE_COORD: `'${observer.lon},${observer.lat},${observer.elevationMeter/1000}'`,
    START_TIME: `'${toHorizonsUtc(start)}'`,
    STOP_TIME: `'${toHorizonsUtc(stop)}'`,
    STEP_SIZE: `'${stepSize}'`, // Ex. `1h`, `30m`, etc.
    ANG_FORMAT: "'DEG'",
    // APPARENT: "'AIRLESS'", // Request apparent coordinates without atmospheric refraction correction
    /**
     * Observer Table Quantities
     * <https://ssd.jpl.nasa.gov/horizons/manual.html#obsquan>
     *
     * For the apparent sky position of the Moon:
     * - [4]: "Apparent AZ & EL"
     *   - `Azi_(a-app)`: Apparent azimuth of the Moon, in degrees.
     *   - `Elev_(a-app)`: Apparent elevation (altitude) of the Moon, in degrees.
     *
     * For the phase or illumination of the Moon:
     * - [10]: "Illuminated fraction"
     *   - `Illu%`: Illuminated fraction of the Moon, 0–100.
     *
     * For the distance to the Moon:
     * - [20]: "Observer range & range-rate"
     *  - `delta`: Observer range (distance) to the Moon, in AU.
     *
     * For the tilt of the Moon:
     * - [1]: "Astrometric RA & DEC"
     *   - `R.A._(ICRF)`: Right ascension of the Moon, in degrees.
     *   - `DEC_(ICRF)`: Declination of the Moon, in degrees.
     * - [7]: "Local apparent sidereal time"
     *   - `L_Ap_Sid_Time`: Local apparent sidereal time at the observer's
     *     location, in hours.
     * - [27]: "Position angles of heliocentric radius & -velocity vector"
     *   - `PsAng`: Position angle of the extended Sun-to-Moon radius vector
     *     (anti-sun / dark-limb direction), in degrees. Add 180° to get the
     *     bright-limb position angle.
     */
    QUANTITIES: "'1,4,7,10,20,27'",
  });
}

/**
 * Fetches a geocentric ecliptic longitude table for the Moon or Sun and returns
 * the raw text response.
 *
 * Same as `queryMoonEphemeris`, `TIME_ZONE` is omitted, so the window and the
 * row labels in the response are UT.
 *
 * @param body - Taken by name rather than by NAIF ID so that transposing the
 *   two call sites is a compile error rather than a silently inverted
 *   difference.
 * @param start - Window start; converted to UT here (see `toHorizonsUtc`)
 * @param stop - Window end, likewise
 */
export async function queryEclipticLongitude(
  body: 'moon' | 'sun',
  start: Temporal.ZonedDateTime,
  stop: Temporal.ZonedDateTime,
): Promise<string> {
  return fetchHorizons({
    format: 'text',
    CSV_FORMAT: "'YES'",
    COMMAND: { moon: "'301'", sun: "'10'" }[body], // Horizons target body ID
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    // Phase is defined geocentrically, so the observer is Earth's center — no
    // `COORD_TYPE`/`SITE_COORD`.
    CENTER: "'500@399'",
    START_TIME: `'${toHorizonsUtc(start)}'`,
    STOP_TIME: `'${toHorizonsUtc(stop)}'`,
    /**
     * Step size for the ecliptic longitude tables, independent of `--freq`. The
     * Moon-Sun difference in longitude advances a near-linear ~0.00847°/min, so
     * interpolating across 10 minutes resolves the crossing to well under a
     * second.
     */
    STEP_SIZE: `'10m'`,
    ANG_FORMAT: "'DEG'",
    /**
     * Observer Table Quantities
     * <https://ssd.jpl.nasa.gov/horizons/manual.html#obsquan>
     *
     * - [31]: "Observer ecliptic longitude & latitude"
     *   - `ObsEcLon`: Apparent ecliptic longitude, in degrees.
     *   - `ObsEcLat`: Apparent ecliptic latitude, in degrees.
     */
    QUANTITIES: "'31'",
  });
}

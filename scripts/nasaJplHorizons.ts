/**
 * Queries the JPL Horizons API for daily Moon position data and summarizes
 * moonrise/moonset times, azimuth, tilt, illumination, and distance.
 *
 * @usage pnpm horizons [YYYY-MM-DD] [--freq=N] [--show-table] [--show-raw]
 */
import { parseArgs } from 'node:util';
import { Temporal } from '@js-temporal/polyfill';
import { location } from '../src/constants.ts';
import type { MoonPhase } from '../src/moonPost.ts';

/**
 * The observing location and date for which the ephemeris is requested, i.e.
 * where and when the Moon is being watched from.
 */
interface Observer {
  date: string; // "YYYY-MM-DD"
  timeZone: string; // IANA, e.g. "America/Los_Angeles"
  lat: number;
  lon: number;
  elevationMeter: number;
}

/**
 * The Moon's observer-centric ephemeris at a single instant: its apparent
 * position and appearance in the observer's sky, i.e. one `--freq` step of the
 * ephemeris.
 */
interface MoonEphemeris {
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

type PhaseEventName = Extract<MoonPhase, 'new' | 'first-quarter' | 'full' | 'third-quarter'>;

/**
 * A single observing day distilled from the full `MoonEphemeris` run.
 */
interface MoonSummary {
  metadata: {
    date: string; // "YYYY-MM-DD"
    timeZone: string; // IANA, e.g. "America/Los_Angeles"
  };
  /**
   * The noon values represent an average of the Moon's illumination and
   * distance of the day.
   */
  noon: {
    illuminatedFraction: number;
    distanceKm: number;
  };
  /**
   * `null` event means it did not occur on this date (e.g. the Moon never rose.)
   */
  events: {
    phaseEvent: { at: Temporal.ZonedDateTime; name: PhaseEventName } | null;
    moonrise: { at: Temporal.ZonedDateTime; azimuthDeg: number; tiltDeg: number } | null;
    moonset: { at: Temporal.ZonedDateTime; azimuthDeg: number; tiltDeg: number } | null;
    sunrise: Temporal.ZonedDateTime | null;
    sunset: Temporal.ZonedDateTime | null;
  };
}

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
 * Fetches the Moon's topocentric, observer-centric ephemeris and returns the
 * raw text response.
 *
 * `TIME_ZONE` is omitted because, as a fixed offset, it cannot express the 23-
 * and 25-hour civil days that a DST transition produces. Instead, the window
 * (i.e. `startTime` and `stopTime`) as well as every row label in the response
 * are UT and the observer's zone is applied per row in `parseHorizonsDatetime`.
 *
 * @param startTime - Window start, in UT (see `toHorizonsUtc`)
 * @param stopTime - Window end, likewise in UT
 */
async function queryMoonEphemeris(
  observer: Observer,
  startTime: string,
  stopTime: string,
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
    START_TIME: `'${startTime}'`,
    STOP_TIME: `'${stopTime}'`,
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
 * @param startTime - Window start, in UT (see `toHorizonsUtc`)
 * @param stopTime - Window end, likewise in UT
 */
async function queryEclipticLongitude(
  body: 'moon' | 'sun',
  startTime: string,
  stopTime: string,
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
    START_TIME: `'${startTime}'`,
    STOP_TIME: `'${stopTime}'`,
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

/**
 * Split a Horizons raw text response into its CSV header names and data rows.
 */
function parseCsvBlock(raw: string): { headers: string[]; rows: string[][] } {
  // Locate the CSV data block delimited by `$$SOE` (start of ephemeris) and
  // `$$EOE` (end of ephemeris).
  const soeIndex = raw.indexOf('$$SOE');
  const eoeIndex = raw.indexOf('$$EOE');
  if (soeIndex === -1 || eoeIndex === -1) {
    throw new Error(
      'Could not find $$SOE/$$EOE markers in Horizons output.\n' +
      'Raw response (first 2000 chars):\n' +
      raw.slice(0, 2000),
    );
  }

  // Extract the CSV header: the last comma-bearing line before the data block.
  const preSOE = raw.slice(0, soeIndex);
  const preLines = preSOE.split('\n').filter((line) => line.trim().length > 0);
  let headerLine = '';
  for (let i = preLines.length - 1; i >= 0; i--) {
    if (preLines[i].includes(',')) {
      headerLine = preLines[i];
      break;
    }
  }
  const headers = headerLine.split(',').map((h) => h.trim());

  // Extract the CSV data rows: the lines between `$$SOE` and `$$EOE`.
  const dataBlock = raw.slice(soeIndex + 5, eoeIndex).trim();
  const rows = dataBlock
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(',').map((c) => c.trim()));

  return { headers, rows };
}

/**
 * Resolve a column by name so we don't rely on fixed column positions.
 */
function columnIndex(headers: string[], pattern: RegExp): number {
  const index = headers.findIndex((header) => pattern.test(header));
  if (index === -1) {
    throw new Error(
      `Column matching ${pattern} not found. Headers: ${JSON.stringify(headers)}`,
    );
  }
  return index;
}

const HORIZONS_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Convert a Horizons row stamp ("2026-Mar-08 08:00", UT) to the observer's zone.
 */
function parseHorizonsDatetime(datetime: string, timeZone: string): Temporal.ZonedDateTime {
  const [datePart, timePart] = datetime.split(' ');
  const monthIndex = HORIZONS_MONTHS.indexOf(datePart.slice(5, 8));
  if (monthIndex === -1) {
    throw new Error(`Unrecognized month in Horizons datetime: ${datetime}`);
  }
  const month = String(monthIndex + 1).padStart(2, '0');
  return Temporal.PlainDateTime
    .from(`${datePart.slice(0, 4)}-${month}-${datePart.slice(9)}T${timePart}`)
    .toZonedDateTime('UTC')
    .withTimeZone(timeZone);
}

/**
 * Parse a `queryMoonEphemeris` response into one `MoonEphemeris` per step,
 * resolving each quantity by header name rather than by position.
 *
 * Right ascension, declination and sidereal time are consumed here rather than
 * carried forward: they exist only to derive `tiltDeg`.
 */
function parseMoonEphemeris(raw: string, observer: Observer): MoonEphemeris[] {
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
  dayStart: Temporal.ZonedDateTime,
  dayEnd: Temporal.ZonedDateTime,
): MoonSummary['events']['phaseEvent'] {
  if (moonLons.length !== sunLons.length) {
    throw new Error(
      `Ecliptic longitude series differ in length: ` +
      `Moon has ${moonLons.length} rows, Sun has ${sunLons.length}.`,
    );
  }

  const dayLengthMinutes = (dayEnd.epochMilliseconds - dayStart.epochMilliseconds) / 60_000;

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
        return { at: dayStart.add({ minutes: at }), name };
      }
    }
  }

  return null;
}

/**
 * Compute the hour angle from LST and RA.
 *
 * @param lstHours - Local apparent sidereal time in decimal hours
 * @param raDeg - Right ascension
 * @returns Hour angle in degrees (positive west)
 */
function computeHourAngleDeg(lstHours: number, raDeg: number): number {
  const lstDeg = lstHours * 15;
  let hourAngleDeg = lstDeg - raDeg;
  // Normalize to [-180, +180]
  while (hourAngleDeg > 180) hourAngleDeg -= 360;
  while (hourAngleDeg < -180) hourAngleDeg += 360;
  return hourAngleDeg;
}

const DEG = Math.PI / 180;
const AU_TO_KM = 149_597_870.7;

/**
 * Compute the parallactic angle at a celestial body.
 *
 * Here, the parallactic angle is the angle at the Moon between the great-circle
 * arcs toward the celestial pole and toward the zenith, measured north through
 * east.
 */
function computeParallacticAngle(
  hourAngleDeg: number, // Positive west of meridian
  decDeg: number, // Declination
  observerLat: number,
): number {
  const h = hourAngleDeg * DEG;
  const d = decDeg * DEG;
  const p = observerLat * DEG;
  const q = Math.atan2(
    Math.sin(h),
    Math.tan(p) * Math.cos(d) - Math.sin(d) * Math.cos(h),
  );
  return q / DEG;
}

/**
 * Compute the tilt of the Moon's bright limb relative to the local vertical.
 */
function moonTilt(
  lstHours: number, // Local apparent sidereal time in decimal hours
  raDeg: number, // Right ascension
  decDeg: number, // Declination
  observerLat: number,
  paSunDeg: number, // Position angle of the Sun (anti-sun/dark-limb direction)
): number {
  const hourAngleDeg = computeHourAngleDeg(lstHours, raDeg);
  const parallacticAngleDeg = computeParallacticAngle(hourAngleDeg, decDeg, observerLat);
  let tiltDeg = (paSunDeg + 180) - parallacticAngleDeg;
  while (tiltDeg > 180) tiltDeg -= 360;
  while (tiltDeg < -180) tiltDeg += 360;
  return tiltDeg;
}

/**
 * Formats an instant's local wall clock as 12-hour time, e.g. "7:30 PM".
 */
function formatTime12h(at: Temporal.ZonedDateTime): string {
  const h = at.hour % 12 || 12;
  const period = at.hour < 12 ? 'AM' : 'PM';
  return `${h}:${String(at.minute).padStart(2, '0')} ${period}`;
}

/**
 * The observing day's true bounds. DST transition days are 23 or 25 hours long,
 * so the end is derived by calendar arithmetic rather than by adding 24 hours.
 */
function civilDayBounds(observer: Observer): {
  start: Temporal.ZonedDateTime;
  end: Temporal.ZonedDateTime;
} {
  const start = Temporal.PlainDate.from(observer.date)
    .toZonedDateTime({ timeZone: observer.timeZone });
  return { start, end: start.add({ days: 1 }) };
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

function parseDateArg(arg: string | undefined): string {
  if (arg !== undefined) Temporal.PlainDate.from(arg); // validates YYYY-MM-DD
  return arg ?? Temporal.Now.plainDateISO().toString();
}

function findRowNearestToNoon(rows: MoonEphemeris[], observer: Observer): MoonEphemeris {
  const noonMs = Temporal.PlainDate.from(observer.date)
    .toZonedDateTime({ timeZone: observer.timeZone, plainTime: '12:00' })
    .epochMilliseconds;

  return rows.reduce((nearest, row) =>
    Math.abs(row.at.epochMilliseconds - noonMs) <
    Math.abs(nearest.at.epochMilliseconds - noonMs) ? row : nearest
  );
}

function computeMoonSummary(
  rows: MoonEphemeris[],
  observer: Observer,
  phaseEvent: MoonSummary['events']['phaseEvent'],
): MoonSummary {
  let moonrise: MoonSummary['events']['moonrise'] = null;
  let moonset: MoonSummary['events']['moonset'] = null;
  let sunrise: MoonSummary['events']['sunrise'] = null;
  let sunset: MoonSummary['events']['sunset'] = null;
  for (let i = 0; i < rows.length; i++) {
    const curr = rows[i];

    if (moonrise === null && curr.flags.includes('r')) {
      moonrise = {
        at: curr.at,
        azimuthDeg: curr.azimuthDeg,
        tiltDeg: curr.tiltDeg,
      };
    }
    if (moonset === null && curr.flags.includes('s')) {
      moonset = {
        at: curr.at,
        azimuthDeg: curr.azimuthDeg,
        tiltDeg: curr.tiltDeg,
      };
    }

    // Sun transitions: '*' flag means sun is above the horizon (daytime)
    if (i > 0) {
      const prev = rows[i - 1];
      if (sunrise === null && !prev.flags.includes('*') && curr.flags.includes('*')) {
        sunrise = curr.at;
      }
      if (sunset === null && prev.flags.includes('*') && !curr.flags.includes('*')) {
        sunset = curr.at;
      }
    }
  }

  const noonRow = findRowNearestToNoon(rows, observer);

  return {
    metadata: {
      date: observer.date,
      timeZone: observer.timeZone,
    },
    noon: {
      illuminatedFraction: noonRow.illuminatedFraction,
      distanceKm: noonRow.distanceKm,
    },
    events: {
      moonrise,
      moonset,
      sunrise,
      sunset,
      phaseEvent,
    },
  };
}

function printTable(moonEphemeris: MoonEphemeris[]): void {
  console.log(
    'Datetime                 | Altº   | Azº    | Illum% | KM      | Tiltº',
  );
  console.log(
    '─────────────────────────┼────────┼────────┼────────┼─────────┼────────',
  );
  for (const row of moonEphemeris) {
    const datetimeStr = `${row.at.toPlainDateTime().toString({ smallestUnit: 'minute' }).replace('T', ' ')} ${row.flags.join('')}`.padEnd(25);
    const altitudeStr = row.altitudeDeg.toFixed(1).padStart(6);
    const azimuthStr = row.azimuthDeg.toFixed(1).padStart(6);
    const illuminationStr = row.illuminatedFraction.toFixed(3).padStart(6);
    const distanceStr = Math.round(row.distanceKm).toLocaleString('en-US').padStart(7);
    const tiltStr = row.tiltDeg.toFixed(1).padStart(6);
    console.log(
      `${datetimeStr}| ${altitudeStr} | ${azimuthStr} | ${illuminationStr} | ${distanceStr} | ${tiltStr}`,
    );
  }
}

const PHASE_EVENT_LABEL: Record<PhaseEventName, string> = {
  'new': 'New Moon',
  'first-quarter': 'First Quarter',
  'full': 'Full Moon',
  'third-quarter': 'Last Quarter',
};

function printSummary(s: MoonSummary, observer: Observer, freqMin: string): void {
  const illuminationStr = s.noon.illuminatedFraction.toFixed(1) + '%';
  const distanceStr = Math.round(s.noon.distanceKm).toLocaleString('en-US') + ' km';
  const NONE_STR = 'not observed today';

  // A day spanning a DST transition has two offsets; showing both makes the 23-
  // and 25-hour days self-announcing.
  const { start: dayStart, end: dayEnd } = civilDayBounds(observer);
  const startOffset = dayStart.offset;
  const endOffset = dayEnd.subtract({ minutes: 1 }).offset;
  const offsetStr = startOffset === endOffset ? startOffset : `${startOffset} → ${endOffset}`;

  console.log('Summary');
  console.log('--------------------------------------------------------------------------------');
  console.log('Observation Parameters:');
  console.log(`  Date:         ${observer.date}`);
  console.log(`  Time Zone:    ${observer.timeZone} (${offsetStr})`);
  console.log(`  Location:     ${observer.lat}, ${observer.lon}, ${observer.elevationMeter} meters`);
  console.log(`  Step Size:    ${freqMin} minutes`);
  console.log();
  console.log('Noon (Average):')
  console.log(`  Illumination: ${illuminationStr}`);
  console.log(`  Distance:     ${distanceStr}`);
  console.log('Events:');
  console.log(
    '  Phase:    ' + (
      s.events.phaseEvent ?
        `${PHASE_EVENT_LABEL[s.events.phaseEvent.name]} (${formatTime12h(s.events.phaseEvent.at)})` :
        NONE_STR
    )
  );
  console.log(
    '  Moonrise: ' + (
      s.events.moonrise ?
        `${formatTime12h(s.events.moonrise.at)} (Azimuth: ${s.events.moonrise.azimuthDeg.toFixed(0)}°, Tilt: ${s.events.moonrise.tiltDeg.toFixed(0)}°)` :
        NONE_STR
    )
  );
  console.log(
    '  Moonset:  ' + (
      s.events.moonset ?
        `${formatTime12h(s.events.moonset.at)} (Azimuth: ${s.events.moonset.azimuthDeg.toFixed(0)}°, Tilt: ${s.events.moonset.tiltDeg.toFixed(0)}°)` :
        NONE_STR
    )
  );
  console.log(`  Sunrise:  ${s.events.sunrise ? formatTime12h(s.events.sunrise) : NONE_STR}`);
  console.log(`  Sunset:   ${s.events.sunset  ? formatTime12h(s.events.sunset)  : NONE_STR}`);
}

function printFixtureJson(summary: MoonSummary): void {
  const { date } = summary.metadata;
  // Stamped from each event's own instant, so a day with two offsets — and the
  // repeated hour of a fall-back day — comes out right.
  const toDateTime = (at: Temporal.ZonedDateTime) =>
    at.toString({ smallestUnit: 'second', timeZoneName: 'never' });

  const fixture = {
    description: '',
    day: date,
    noon: {
      illumination: Math.round(summary.noon.illuminatedFraction),
      distanceKm: Math.round(summary.noon.distanceKm),
    },
    events: {
      phaseEvent: summary.events.phaseEvent
        ? {
            name: summary.events.phaseEvent.name,
            dateTime: toDateTime(summary.events.phaseEvent.at),
          }
        : null,
      moonrise: summary.events.moonrise
        ? {
            dateTime: toDateTime(summary.events.moonrise.at),
            azimuthDeg: summary.events.moonrise.azimuthDeg,
            tiltDeg: summary.events.moonrise.tiltDeg
          }
        : null,
      moonset: summary.events.moonset
        ? {
            dateTime: toDateTime(summary.events.moonset.at),
            azimuthDeg: summary.events.moonset.azimuthDeg,
            tiltDeg: summary.events.moonset.tiltDeg
          }
        : null,
      sunrise: summary.events.sunrise
        ? {
            dateTime: toDateTime(summary.events.sunrise)
          }
        : null,
      sunset: summary.events.sunset
        ? {
            dateTime: toDateTime(summary.events.sunset)
          }
        : null,
    },
  };

  console.log('Fixture JSON');
  console.log('--------------------------------------------------------------------------------');
  console.log(JSON.stringify(fixture, null, 2));
}

async function main(): Promise<void> {
  const { values: argValues, positionals: argPositionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      freq: { type: 'string', default: '1' },
      'show-raw': { type: 'boolean', default: false },
      'show-table': { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });
  const date = parseDateArg(argPositionals[0]);
  const freqMin = argValues.freq;
  const showRaw = argValues['show-raw'];
  const showTable = argValues['show-table'];

  const observer: Observer = {
    date,
    timeZone: location.timezone,
    lat: location.latitude,
    lon: location.longitude,
    elevationMeter: 20, // Elevation is hardcoded for now
  };

  const { start: dayStart, end: dayEnd } = civilDayBounds(observer);

  const response = await queryMoonEphemeris(
    observer,
    toHorizonsUtc(dayStart),
    toHorizonsUtc(dayEnd.subtract({ minutes: 1 })),
    `${freqMin}m`,
  );
  if (showRaw) console.log(response);

  const moonEphemeris = parseMoonEphemeris(response, observer);

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
  const illumination = moonEphemeris.map((row) => row.illuminatedFraction);
  const minIllum = Math.min(...illumination);
  const maxIllum = Math.max(...illumination);
  const mayHavePhaseEvent =
    maxIllum > 99 || minIllum < 1 || (minIllum <= 52 && maxIllum >= 48);

  let phaseEvent: MoonSummary['events']['phaseEvent'] = null;
  if (mayHavePhaseEvent) {
    // Stop at the next day's midnight rather than 23:59, which would leave a
    // one-minute blind spot.
    const startTime = toHorizonsUtc(dayStart);
    const stopTime = toHorizonsUtc(dayEnd);
    const [moonRaw, sunRaw] = await Promise.all([
      queryEclipticLongitude('moon', startTime, stopTime),
      queryEclipticLongitude('sun', startTime, stopTime),
    ]);
    phaseEvent = findPhaseEvent(
      parseEclipticLongitudes(moonRaw, observer, dayStart),
      parseEclipticLongitudes(sunRaw, observer, dayStart),
      dayStart,
      dayEnd,
    );
  }

  const moonSummary = computeMoonSummary(moonEphemeris, observer, phaseEvent);

  console.log();
  if (showTable) printTable(moonEphemeris);
  printSummary(moonSummary, observer, freqMin);
  console.log();
  printFixtureJson(moonSummary);
}

main().catch(console.error);

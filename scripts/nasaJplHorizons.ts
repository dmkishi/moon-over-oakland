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
  datetime: string; // Observer-local civil datetime, e.g. "2001-12-31 23:59"
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
  distanceKm: number; // Distance in km
  tiltDeg: number; // Tilt of the moon (relative to the local vertical)
}

type PhaseEventName = Extract<MoonPhase, 'new' | 'first-quarter' | 'full' | 'third-quarter'>;

/**
 * A single observing day distilled from the full `MoonEphemeris` run.
 */
interface MoonSummary {
  metadata: {
    date: string; // "YYYY-MM-DD"
    timeZone: {
      name: string; // IANA, e.g. "America/Los_Angeles"
      offset: string; // e.g. "-07:00"
    };
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
   * - Times are observer-local civil times ("HH:mm".)
   * - `null` event means it did not occur on this date (e.g. the Moon never rose.)
   */
  events: {
    phaseEvent: { time: string; name: PhaseEventName } | null;
    moonrise: { time: string; azimuthDeg: number; tiltDeg: number } | null;
    moonset: { time: string; azimuthDeg: number; tiltDeg: number } | null;
    sunrise: string | null;
    sunset: string | null;
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
 */
async function queryMoonEphemeris(
  observer: Observer,
  startTime: string,
  stopTime: string,
  stepSize: string,
): Promise<string> {
  const timeZoneOffset = getUtcOffset(observer.date, observer.timeZone);
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
    TIME_ZONE: `'${timeZoneOffset}'`, // Specify local civil time offset relative to UT
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
 * @param body - Taken by name rather than by NAIF ID so that transposing the
 *   two call sites is a compile error rather than a silently inverted
 *   difference.
 */
async function queryEclipticLongitude(
  body: 'moon' | 'sun',
  observer: Observer,
  startTime: string,
  stopTime: string,
): Promise<string> {
  const timeZoneOffset = getUtcOffset(observer.date, observer.timeZone);
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
    TIME_ZONE: `'${timeZoneOffset}'`, // Specify local civil time offset relative to UT
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
  // Locate the data block delimited by `$$SOE` (start of ephemeris) and `$$EOE`
  // (end of ephemeris).
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
      datetime: cols[0],
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
 * One sample of a body's ecliptic longitude, timed relative to the observing
 * day's midnight.
 */
interface EclipticLongitude {
  minutesFromMidnight: number;
  lonDeg: number;
}

function parseEclipticLongitudes(raw: string): EclipticLongitude[] {
  const { headers, rows } = parseCsvBlock(raw);
  const iLon = columnIndex(headers, /ObsEcLon/);

  // The query window closes on the *next* day's 00:00, which would otherwise
  // parse back to minute 0. Keep the series monotonic by counting past
  // midnight, so that final sample lands on minute 1440.
  let dayOffsetMin = 0;
  let prevMinutes = -1;

  return rows.map((cols) => {
    const timePart = cols[0].split(' ')[1] ?? '00:00';
    const [hour, minute] = timePart.split(':').map(Number);
    const minutes = hour * 60 + minute;
    if (minutes < prevMinutes) dayOffsetMin += 1440;
    prevMinutes = minutes;
    return {
      minutesFromMidnight: minutes + dayOffsetMin,
      lonDeg: parseFloat(cols[iLon]),
    };
  });
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
): MoonSummary['events']['phaseEvent'] {
  if (moonLons.length !== sunLons.length) {
    throw new Error(
      `Ecliptic longitude series differ in length: ` +
      `Moon has ${moonLons.length} rows, Sun has ${sunLons.length}.`,
    );
  }

  const series = moonLons.map((moon, i) => ({
    minutes: moon.minutesFromMidnight,
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
        if (at >= 1440) return null;
        const hh = String(Math.floor(at / 60)).padStart(2, '0');
        const mm = String(at % 60).padStart(2, '0');
        return { time: `${hh}:${mm}`, name };
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
  const lstDeg = lstHours * 15; // convert hours → degrees
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
 * Formats a "HH:MM" string as 12-hour time, e.g. "19:30" → "7:30 PM".
 */
function formatTime12h(time: string): string {
  const pt = Temporal.PlainTime.from(time);
  const h = pt.hour % 12 || 12;
  const period = pt.hour < 12 ? 'AM' : 'PM';
  return `${h}:${String(pt.minute).padStart(2, '0')} ${period}`;
}

/**
 * Returns the UTC offset (e.g. "-07:00") for a given date and time zone,
 * accounting for DST.
 */
function getUtcOffset(date: string, timeZone: string): string {
  const zdt = Temporal.PlainDate.from(date)
    .toZonedDateTime({ timeZone, plainTime: '12:00' });
  return zdt.offset;
}

function parseDateArg(arg: string | undefined): string {
  if (arg !== undefined) Temporal.PlainDate.from(arg); // validates YYYY-MM-DD
  return arg ?? Temporal.Now.plainDateISO().toString();
}

function findRowNearestToNoon(rows: MoonEphemeris[]): MoonEphemeris {
  /** Convert "YYYY-MM-DD HH:MM" → minutes-since-midnight */
  function datetimeToMinutes(datetime: string): number {
    const timePart = datetime.split(' ')[1] ?? '00:00';
    const [h, m] = timePart.split(':').map(Number);
    return h * 60 + m;
  }

  return rows.reduce((nearest, row) =>
    Math.abs(datetimeToMinutes(row.datetime) - 720) <
    Math.abs(datetimeToMinutes(nearest.datetime) - 720) ? row : nearest
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
        time: curr.datetime.split(' ')[1],
        azimuthDeg: curr.azimuthDeg,
        tiltDeg: curr.tiltDeg,
      };
    }
    if (moonset === null && curr.flags.includes('s')) {
      moonset = {
        time: curr.datetime.split(' ')[1],
        azimuthDeg: curr.azimuthDeg,
        tiltDeg: curr.tiltDeg,
      };
    }

    // Sun transitions: '*' flag means sun is above the horizon (daytime)
    if (i > 0) {
      const prev = rows[i - 1];
      if (sunrise === null && !prev.flags.includes('*') && curr.flags.includes('*')) {
        sunrise = curr.datetime.split(' ')[1];
      }
      if (sunset === null && prev.flags.includes('*') && !curr.flags.includes('*')) {
        sunset = curr.datetime.split(' ')[1];
      }
    }
  }

  const noonRow = findRowNearestToNoon(rows);

  return {
    metadata: {
      date: observer.date,
      timeZone: {
        name: observer.timeZone,
        offset: getUtcOffset(observer.date, observer.timeZone),
      },
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
    const datetimeStr = `${row.datetime} ${row.flags.join('')}`.padEnd(25);
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

  console.log('Summary');
  console.log('--------------------------------------------------------------------------------');
  console.log('Observation Parameters:');
  console.log(`  Date:         ${observer.date}`);
  console.log(`  Time Zone:    ${observer.timeZone} (${getUtcOffset(observer.date, observer.timeZone)})`);
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
        `${PHASE_EVENT_LABEL[s.events.phaseEvent.name]} (${formatTime12h(s.events.phaseEvent.time)})` :
        NONE_STR
    )
  );
  console.log(
    '  Moonrise: ' + (
      s.events.moonrise ?
        `${formatTime12h(s.events.moonrise.time)} (Azimuth: ${s.events.moonrise.azimuthDeg.toFixed(0)}°, Tilt: ${s.events.moonrise.tiltDeg.toFixed(0)}°)` :
        NONE_STR
    )
  );
  console.log(
    '  Moonset:  ' + (
      s.events.moonset ?
        `${formatTime12h(s.events.moonset.time)} (Azimuth: ${s.events.moonset.azimuthDeg.toFixed(0)}°, Tilt: ${s.events.moonset.tiltDeg.toFixed(0)}°)` :
        NONE_STR
    )
  );
  console.log(`  Sunrise:  ${s.events.sunrise ? formatTime12h(s.events.sunrise) : NONE_STR}`);
  console.log(`  Sunset:   ${s.events.sunset  ? formatTime12h(s.events.sunset)  : NONE_STR}`);
}

function printFixtureJson(summary: MoonSummary): void {
  const { date, timeZone } = summary.metadata;
  const toDateTime = (time: string) => `${date}T${time}:00${timeZone.offset}`;

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
            dateTime: toDateTime(summary.events.phaseEvent.time),
          }
        : null,
      moonrise: summary.events.moonrise
        ? {
            dateTime: toDateTime(summary.events.moonrise.time),
            azimuthDeg: summary.events.moonrise.azimuthDeg,
            tiltDeg: summary.events.moonrise.tiltDeg
          }
        : null,
      moonset: summary.events.moonset
        ? {
            dateTime: toDateTime(summary.events.moonset.time),
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

  const response = await queryMoonEphemeris(
    observer,
    `${observer.date} 00:00`,
    `${observer.date} 23:59`,
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
    const startTime = `${observer.date} 00:00`;
    const stopTime = `${Temporal.PlainDate.from(observer.date).add({ days: 1 })} 00:00`;
    const [moonRaw, sunRaw] = await Promise.all([
      queryEclipticLongitude('moon', observer, startTime, stopTime),
      queryEclipticLongitude('sun', observer, startTime, stopTime),
    ]);
    phaseEvent = findPhaseEvent(
      parseEclipticLongitudes(moonRaw),
      parseEclipticLongitudes(sunRaw),
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

/**
 * Queries the JPL Horizons API for daily Moon position data and summarizes
 * moonrise/moonset times, azimuth, tilt, illumination, and distance.
 *
 * @usage pnpm horizons [YYYY-MM-DD] [--freq=N] [--show-table] [--show-raw]
 */
import { parseArgs } from 'node:util';
import { Temporal } from '@js-temporal/polyfill';
import { location } from '../src/constants.ts';

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
    moonrise: { time: string; azimuthDeg: number; tiltDeg: number } | null;
    moonset: { time: string; azimuthDeg: number; tiltDeg: number } | null;
    sunrise: string | null;
    sunset: string | null;
  };
}

/**
 * Fetch Moon ephemeris from the NASA JPL Horizons API, returning the raw text
 * response.
 */
async function queryHorizons(
  observer: Observer,
  startTime: string,
  stopTime: string,
  stepSize: string,
): Promise<string> {
  const timeZoneOffset = getUtcOffset(observer.date, observer.timeZone);
  const params = Object.entries({
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
  }).map(([k, v]) => `${k}=${v}`).join('&');
  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${params}`;
  console.log(`Calling <${url}>`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Horizons API error: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/**
 * A single row of the Horizons CSV data block.
 */
interface HorizonsRow {
  datetime: string;
  flags: string[];
  raDeg: number;
  decDeg: number;
  azimuthDeg: number;
  elevationDeg: number;
  lst: number; // hours (local apparent sidereal time)
  illuminatedFraction: number;
  distanceAU: number;
  paSunDeg: number;
}

function parseHorizonsCSV(raw: string): HorizonsRow[] {
  // Index the data block delimited by `$$SOE` (start of ephemeris) and `$$EOE`
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

  // Extract the CSV header.
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

  // Collect flag columns, identified by empty headers.
  const flagIndices = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h === '')
    .map(({ i }) => i);

  // Build a name → index map so we don't rely on fixed column positions.
  const columnIndex = (pattern: RegExp): number => {
    const index = headers.findIndex((header) => pattern.test(header));
    if (index === -1) {
      throw new Error(
        `Column matching ${pattern} not found. Headers: ${JSON.stringify(headers)}`,
      );
    }
    return index;
  };
  const iRA = columnIndex(/R.A._\(ICRF\)/); // Right ascension of the Moon
  const iDEC = columnIndex(/DEC_\(ICRF\)/); // Declination of the Moon
  const iAZ = columnIndex(/Azi_\(a-app\)/); // Apparent azimuth of the Moon
  const iEL = columnIndex(/Elev_\(a-app\)/); // Apparent elevation (altitude) of the Moon
  const iLST = columnIndex(/L_Ap_Sid_Time/); // Local apparent sidereal time
  const iIllum = columnIndex(/Illu%/); // Illuminated fraction of the Moon
  const iDelta = columnIndex(/^delta$/i); // Distance in AU
  const iPsAng = columnIndex(/PsAng/); // Position angle of the Sun w/r/t to the Moon

  const dataBlock = raw.slice(soeIndex + 5, eoeIndex).trim();
  const lines = dataBlock.split("\n").filter((line) => line.trim().length > 0);

  return lines.map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    return {
      datetime: cols[0],
      flags: flagIndices.map(i => cols[i]).filter(f => f !== ''),
      raDeg: parseFloat(cols[iRA]),
      decDeg: parseFloat(cols[iDEC]),
      azimuthDeg: parseFloat(cols[iAZ]),
      elevationDeg: parseFloat(cols[iEL]),
      lst: parseFloat(cols[iLST]),
      illuminatedFraction: parseFloat(cols[iIllum]),
      distanceAU: parseFloat(cols[iDelta]),
      paSunDeg: parseFloat(cols[iPsAng]),
    };
  });
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

function computeMoonEphemeris(
  rows: HorizonsRow[],
  observer: Observer,
): MoonEphemeris[] {
  return rows
    .map((row) => {
      return {
        datetime: row.datetime,
        flags: row.flags,
        azimuthDeg: row.azimuthDeg,
        altitudeDeg: row.elevationDeg,
        illuminatedFraction: row.illuminatedFraction,
        distanceKm: row.distanceAU * AU_TO_KM,
        tiltDeg: moonTilt(
          row.lst,
          row.raDeg,
          row.decDeg,
          observer.lat,
          row.paSunDeg,
        ),
      };
    });
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

  const response = await queryHorizons(
    observer,
    `${observer.date} 00:00`,
    `${observer.date} 23:59`,
    `${freqMin}m`,
  );
  if (showRaw) console.log(response);

  const rows = parseHorizonsCSV(response);
  const moonEphemeris = computeMoonEphemeris(rows, observer);
  const moonSummary = computeMoonSummary(moonEphemeris, observer);

  console.log();
  if (showTable) printTable(moonEphemeris);
  printSummary(moonSummary, observer, freqMin);
  console.log();
  printFixtureJson(moonSummary);
}

main().catch(console.error);

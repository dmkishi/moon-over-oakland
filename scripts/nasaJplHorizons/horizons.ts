/**
 * The whole conversation with NASA JPL's Horizons API.
 * <https://ssd.jpl.nasa.gov/horizons/manual.html>
 *
 * What we ask for and how the reply reads back are two halves of one contract:
 * the quantities requested decide which columns arrive, and the UT window sent
 * is the frame the row labels come back in. Both halves are stated here so they
 * cannot drift apart, and everything downstream sees only typed rows.
 */
import type { Observer } from './observer.ts';
import { moonTilt } from './tilt.ts';

const HORIZONS_API_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';

/**
 * Horizons target body IDs. Bodies are named at every call site rather than
 * given by ID so that transposing two of them is a compile error rather than a
 * silently inverted result.
 */
const BODY_COMMAND = { moon: "'301'", sun: "'10'" };

type Body = keyof typeof BODY_COMMAND;

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

const HORIZONS_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * The inverse of `toHorizonsUtc`: reads a row stamp ("2026-Mar-08 08:00", UT)
 * back as an instant.
 *
 * Row labels are UT because `TIME_ZONE` is omitted from every request (see
 * `requestObserverTable`), so a zone is applied to the instant afterwards by
 * whoever wants one rather than read off the response.
 */
function parseHorizonsInstant(datetime: string): Temporal.Instant {
  const [datePart, timePart] = datetime.split(' ');
  if (datePart === undefined || timePart === undefined) {
    throw new Error(`Unrecognized Horizons datetime: ${datetime}`);
  }
  const monthIndex = HORIZONS_MONTHS.indexOf(datePart.slice(5, 8));
  if (monthIndex === -1) {
    throw new Error(`Unrecognized month in Horizons datetime: ${datetime}`);
  }
  const month = String(monthIndex + 1).padStart(2, '0');
  return Temporal.PlainDateTime
    .from(`${datePart.slice(0, 4)}-${month}-${datePart.slice(9)}T${timePart}`)
    .toZonedDateTime('UTC')
    .toInstant();
}

/**
 * Split a raw text response into its CSV header names and data rows.
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
      raw.slice(0, 2_000),
    );
  }

  // Extract the CSV header: the last comma-bearing line before the data block.
  const preSOE = raw.slice(0, soeIndex);
  const preLines = preSOE.split('\n').filter((line) => line.trim().length > 0);
  const headerLine = preLines.findLast((line) => line.includes(',')) ?? '';
  const headers = headerLine.split(',').map((h) => h.trim());

  // Extract the CSV data rows: the lines between `$$SOE` and `$$EOE`. Throw if
  // row count deviates from the header count.
  const dataBlock = raw.slice(soeIndex + 5, eoeIndex).trim();
  const rows = dataBlock
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const cells = line.split(',').map((c) => c.trim());
      if (cells.length !== headers.length) {
        throw new Error(
          `Horizons row has ${cells.length} columns, expected ${headers.length}: ${line.trim()}`,
        );
      }
      return cells;
    });

  return { headers, rows };
}

/**
 * Read one cell of a row returned by `parseCsvBlock`.
 */
function cell(cols: string[], index: number): string {
  const value = cols[index];
  if (value === undefined) {
    throw new Error(`Horizons row has no column ${index}: ${cols.join(',')}`);
  }
  return value;
}

/**
 * Read one cell as a number, rejecting the row rather than passing `NaN` on.
 */
function numericCell(cols: string[], index: number): number {
  const text = cell(cols, index);
  const value = Number(text);
  if (text === '' || Number.isNaN(value)) {
    throw new TypeError(`Horizons column ${index} is not a number: ${cols.join(',')}`);
  }
  return value;
}

/**
 * A column read out of an observer table, paired with the Observer Table
 * Quantity that produces it.
 * <https://ssd.jpl.nasa.gov/horizons/manual.html#obsquan>
 *
 * @property quantity - Quantity code to request in order to be sent this column
 * @property headerPattern - Matches the column's header name, so that nothing
 *   depends on fixed column positions
 */
interface Column {
  quantity: number;
  headerPattern: RegExp;
}

/**
 * The `QUANTITIES` list that asks for exactly these columns. Derived rather than
 * written out, so adding or dropping a column changes what is requested and what
 * is read in a single edit.
 */
function quantitiesFor(columns: Record<string, Column>): string {
  const codes = new Set(Object.values(columns).map(({ quantity }) => quantity));
  return [...codes].toSorted((a, b) => a - b).join(',');
}

/**
 * Locate each column in the header row of the response it was requested from.
 */
function resolveColumns<K extends string>(
  headers: string[],
  columns: Record<K, Column>,
): Record<K, number> {
  const entries: [string, number][] = [];
  for (const [name, { headerPattern }] of Object.entries<Column>(columns)) {
    const index = headers.findIndex((h) => headerPattern.test(h));
    if (index === -1) {
      throw new Error(
        `Column matching ${headerPattern} not found. Headers: ${JSON.stringify(headers)}`,
      );
    }
    entries.push([name, index]);
  }

  // One entry per key of `columns`, so the result really is `Record<K, number>`;
  // only `Object.fromEntries`'s signature widens the keys back to `string`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return Object.fromEntries(entries) as Record<K, number>;
}

interface ObserverTableQuery {
  body: Body;
  /**
   * Where the table is computed from: the observing site, or `'geocentric'` for
   * Earth's center.
   */
  site: Observer | 'geocentric';
  /** Window start; converted to UT here (see `toHorizonsUtc`) */
  start: Temporal.ZonedDateTime;
  /** Window end, likewise */
  stop: Temporal.ZonedDateTime;
  stepSize: string;
  quantities: string;
  /** Hands the untouched response body to a caller that wants to show it. */
  onRawResponse?: ((raw: string) => void) | undefined;
}

/**
 * Ask Horizons for one CSV observer table and return it split into header names
 * and data rows.
 *
 * `TIME_ZONE` is omitted because, as a fixed offset, it cannot express the 23-
 * and 25-hour civil days that a DST transition produces. Instead the window is
 * sent as UT and every row label comes back as UT, to be re-expressed per row by
 * whoever asked (see `parseHorizonsInstant`).
 */
async function requestObserverTable({
  body, site, start, stop, stepSize, quantities, onRawResponse,
}: ObserverTableQuery): Promise<{ headers: string[]; rows: string[][] }> {
  const params: Record<string, string> = {
    format: 'text', // `json` merely wraps the text content in a JSON object
    CSV_FORMAT: "'YES'", // Request CSV output for easier parsing
    COMMAND: BODY_COMMAND[body],
    OBJ_DATA: "'NO'", // Suppress extra object info in output
    MAKE_EPHEM: "'YES'", // Request ephemeris output (this is what we need)
    EPHEM_TYPE: "'OBSERVER'", // Topocentric observer-table ephemeris
    ...(site === 'geocentric' ? {
      CENTER: "'500@399'", // Earth's center
    } : {
      CENTER: "'coord@399'", // Earth
      COORD_TYPE: "'GEODETIC'", // Geodetic coordinates (lat/lon/elev) for observer location
      SITE_COORD: `'${site.lon},${site.lat},${site.elevationMeter / 1_000}'`,
    }),
    START_TIME: `'${toHorizonsUtc(start)}'`,
    STOP_TIME: `'${toHorizonsUtc(stop)}'`,
    STEP_SIZE: `'${stepSize}'`,
    ANG_FORMAT: "'DEG'",
    // APPARENT: "'AIRLESS'", // Request apparent coordinates without atmospheric refraction correction
    QUANTITIES: `'${quantities}'`,
  };

  const query = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
  const url = `${HORIZONS_API_URL}?${query}`;
  console.log(`Calling <${url}>`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Horizons API error: ${res.status} ${res.statusText}`);
  }

  const raw = await res.text();
  onRawResponse?.(raw);
  return parseCsvBlock(raw);
}

/**
 * The columns making up an observer-centric Moon ephemeris.
 *
 * Right ascension, declination and sidereal time are requested only to derive
 * `tiltDeg` and are consumed on the way out; the rest are carried through to
 * `MoonEphemeris` as they arrive.
 */
const MOON_EPHEMERIS_COLUMNS = {
  /** Right ascension of the Moon, in degrees */
  rightAscensionDeg: { quantity: 1, headerPattern: /R.A._\(ICRF\)/u },
  /** Declination of the Moon, in degrees */
  declinationDeg: { quantity: 1, headerPattern: /DEC_\(ICRF\)/u },
  /** Apparent azimuth of the Moon, in degrees */
  azimuthDeg: { quantity: 4, headerPattern: /Azi_\(a-app\)/u },
  /** Apparent elevation (altitude) of the Moon, in degrees */
  altitudeDeg: { quantity: 4, headerPattern: /Elev_\(a-app\)/u },
  /** Local apparent sidereal time at the observer's location, in hours */
  siderealTimeHours: { quantity: 7, headerPattern: /L_Ap_Sid_Time/u },
  /** Illuminated fraction of the Moon's disk, as a percentage, 0–100 */
  illuminatedPercent: { quantity: 10, headerPattern: /Illu%/u },
  /** Observer range (distance) to the Moon, in AU */
  distanceAu: { quantity: 20, headerPattern: /^delta$/ui },
  /**
   * Position angle of the extended Sun-to-Moon radius vector (anti-sun /
   * dark-limb direction), in degrees. Add 180° to get the bright-limb position
   * angle.
   */
  sunPositionAngleDeg: { quantity: 27, headerPattern: /PsAng/u },
} satisfies Record<string, Column>;

type MoonColumn = keyof typeof MOON_EPHEMERIS_COLUMNS;

/**
 * Fixed at one minute, and deliberately not configurable. Horizons does not
 * interpolate rise/set: it tags the nearest grid row with `r`/`s`, so event
 * resolution equals the step size and the summary's azimuth and tilt are read
 * off that row.
 *
 * One minute bounds the error to ~0.14° of azimuth and ~0.12° of tilt, two
 * orders of magnitude inside the accuracy suite's tolerances.
 */
export const MOON_EPHEMERIS_STEP_SIZE = '1m';

const AU_TO_KM = 149_597_870.7;

/**
 * The Moon's observer-centric ephemeris at a single instant: its apparent
 * position and appearance in the observer's sky.
 */
export interface MoonEphemeris {
  at: Temporal.ZonedDateTime; // Row instant re-expressed in the observer's zone
  /**
   * Flag legend:
   * - `*`: Sun is above the horizon (daytime)
   * - `C`: Civil twilight
   * - `N`: Nautical twilight
   * - `A`: Astronomical twilight
   * - `r`: Moonrise event
   * - `m`: Refracted upper-limb of Moon on or above apparent horizon
   * - `e`: Moon elevation max (target body maximum elevation angle has occurred)
   * - `t`: Moon transit (target body at or passed through observer meridian)
   * - `s`: Moonset event
   */
  flags: string[];
  azimuthDeg: number; // Apparent azimuth of the Moon
  altitudeDeg: number; // Apparent altitude of the Moon
  illuminatedPercent: number; // Illuminated fraction of the disk, as a percentage (0–100)
  distanceKm: number;
  tiltDeg: number; // Tilt of the moon (relative to the local vertical)
}

export type MoonEventName = 'moonrise' | 'moonset' | 'transit' | 'sunrise' | 'sunset';

/**
 * The flags standing for an event on their own row. The twilight flags (`C`,
 * `N`, `A`) and the `m`/`e` states describe the row rather than mark an
 * occurrence, so they decode to nothing.
 */
const EVENT_FLAGS: Record<string, MoonEventName> = {
  'r': 'moonrise',
  's': 'moonset',
  't': 'transit',
};

/**
 * The events occurring during `row`'s step, e.g. `['transit', 'sunset']`.
 *
 * Sunrise and sunset have no flag of their own: `*` marks daytime, so the
 * crossing is a change between consecutive rows.
 *
 * @param prev - `undefined` for the first row
 */
export function eventsAt(
  row: MoonEphemeris,
  prev: MoonEphemeris | undefined,
): MoonEventName[] {
  const names = row.flags
    .map((flag) => EVENT_FLAGS[flag])
    .filter((name) => name !== undefined);

  const isDay = row.flags.includes('*');
  if (prev !== undefined && prev.flags.includes('*') !== isDay) {
    names.push(isDay ? 'sunrise' : 'sunset');
  }

  return names;
}

/**
 * Fetch the Moon's topocentric, observer-centric ephemeris as one
 * `MoonEphemeris` per step.
 *
 * @param onRawResponse - Receives the untouched response body, for `--show-raw`
 */
export async function fetchMoonEphemeris(
  observer: Observer,
  start: Temporal.ZonedDateTime,
  stop: Temporal.ZonedDateTime,
  onRawResponse?: (raw: string) => void,
): Promise<MoonEphemeris[]> {
  const { headers, rows } = await requestObserverTable({
    body: 'moon',
    site: observer,
    start,
    stop,
    stepSize: MOON_EPHEMERIS_STEP_SIZE,
    quantities: quantitiesFor(MOON_EPHEMERIS_COLUMNS),
    onRawResponse,
  });

  const columnIndex = resolveColumns(headers, MOON_EPHEMERIS_COLUMNS);

  // Collect flag columns, identified by empty headers.
  const flagIndices = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h === '')
    .map(({ i }) => i);

  return rows.map((cols) => {
    const num = (name: MoonColumn) => numericCell(cols, columnIndex[name]);
    return {
      at: parseHorizonsInstant(cell(cols, 0)).toZonedDateTimeISO(observer.timeZone),
      flags: flagIndices.map((i) => cell(cols, i)).filter((f) => f !== ''),
      azimuthDeg: num('azimuthDeg'),
      altitudeDeg: num('altitudeDeg'),
      illuminatedPercent: num('illuminatedPercent'),
      distanceKm: num('distanceAu') * AU_TO_KM,
      tiltDeg: moonTilt(
        num('siderealTimeHours'),
        num('rightAscensionDeg'),
        num('declinationDeg'),
        observer.lat,
        num('sunPositionAngleDeg'),
      ),
    };
  });
}

const ECLIPTIC_LONGITUDE_COLUMNS = {
  /** Apparent ecliptic longitude, in degrees */
  lonDeg: { quantity: 31, headerPattern: /ObsEcLon/u },
} satisfies Record<string, Column>;

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
export interface EclipticLongitude {
  at: Temporal.Instant;
  lonDeg: number;
}

/**
 * Fetch a geocentric ecliptic longitude table for the Moon or Sun.
 */
export async function fetchEclipticLongitudes(
  body: Body,
  start: Temporal.ZonedDateTime,
  stop: Temporal.ZonedDateTime,
): Promise<EclipticLongitude[]> {
  const { headers, rows } = await requestObserverTable({
    body,
    // Phase is defined geocentrically, so the observer is Earth's center.
    site: 'geocentric',
    start,
    stop,
    stepSize: ECLIPTIC_LONGITUDE_STEP_SIZE,
    quantities: quantitiesFor(ECLIPTIC_LONGITUDE_COLUMNS),
  });

  const columnIndex = resolveColumns(headers, ECLIPTIC_LONGITUDE_COLUMNS);

  return rows.map((cols) => ({
    at: parseHorizonsInstant(cell(cols, 0)),
    lonDeg: numericCell(cols, columnIndex.lonDeg),
  }));
}

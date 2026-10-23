/**
 * The whole conversation with NASA JPL's Horizons API.
 * <https://ssd.jpl.nasa.gov/horizons/manual.html>
 *
 * What we ask for and how the reply reads back are two halves of one contract:
 * the quantities requested decide which columns arrive, and the UT window sent
 * is the frame the row labels come back in. Both halves are stated here so they
 * cannot drift apart, and everything downstream sees only typed rows.
 */
import type { Site } from './site.ts';
import { moonTilt, wrapDeg180, wrapDeg360 } from './tilt.ts';

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
 * Every column any query reads. Each query names the ones it needs, so a column
 * is defined once however many queries share it.
 */
const COLUMNS = {
  /** Right ascension, ICRF, in degrees */
  icrfRightAscensionDeg: { quantity: 1, headerPattern: /R.A._\(ICRF\)/u },
  /** Declination, ICRF, in degrees */
  icrfDeclinationDeg: { quantity: 1, headerPattern: /DEC_\(ICRF\)/u },
  /**
   * Apparent right ascension, on the true equator and equinox of date, in
   * degrees. ICRF would tilt every position angle by the precession since J2000
   * (~0.15° by 2026), and so would `PsAng`, which is why the bright limb is
   * derived from these instead.
   */
  apparentRightAscensionDeg: { quantity: 2, headerPattern: /R\.A\._+\(a-app\)/u },
  /** Apparent declination, likewise, in degrees */
  apparentDeclinationDeg: { quantity: 2, headerPattern: /DEC_+\(a-app\)/u },
  /** Apparent azimuth, in degrees */
  azimuthDeg: { quantity: 4, headerPattern: /Azi_\(a-app\)/u },
  /** Apparent elevation (altitude), in degrees */
  altitudeDeg: { quantity: 4, headerPattern: /Elev_\(a-app\)/u },
  /** Local apparent sidereal time at the observer's location, in hours */
  siderealTimeHours: { quantity: 7, headerPattern: /L_Ap_Sid_Time/u },
  /** Illuminated fraction of the disk, as a percentage, 0–100 */
  illuminatedPercent: { quantity: 10, headerPattern: /Illu%/u },
  /** Angular diameter, in arcseconds */
  angularDiameterArcsec: { quantity: 13, headerPattern: /Ang-diam/u },
  /** Sub-observer point: libration in longitude, in degrees */
  subEarthLonDeg: { quantity: 14, headerPattern: /ObsSub-LON/u },
  /** Sub-observer point: libration in latitude, in degrees */
  subEarthLatDeg: { quantity: 14, headerPattern: /ObsSub-LAT/u },
  /** Subsolar longitude, in degrees */
  subSolarLonDeg: { quantity: 15, headerPattern: /SunSub-LON/u },
  /** Subsolar latitude, in degrees */
  subSolarLatDeg: { quantity: 15, headerPattern: /SunSub-LAT/u },
  /** Position angle of the north pole, in degrees */
  axisPositionAngleDeg: { quantity: 17, headerPattern: /NP\.ang/u },
  /** Observer range (distance), in AU */
  distanceAu: { quantity: 20, headerPattern: /^delta$/ui },
  /** Sun–target–observer angle, i.e. the phase angle, in degrees */
  phaseAngleDeg: { quantity: 24, headerPattern: /S-T-O/u },
  /**
   * Position angle of the extended Sun-to-target radius vector (anti-sun /
   * dark-limb direction), in degrees. Add 180° to get the bright-limb position
   * angle.
   */
  sunPositionAngleDeg: { quantity: 27, headerPattern: /PsAng/u },
  /** Apparent ecliptic longitude, in degrees */
  eclipticLonDeg: { quantity: 31, headerPattern: /ObsEcLon/u },
} satisfies Record<string, Column>;

type ColumnName = keyof typeof COLUMNS;

/**
 * The `QUANTITIES` list that asks for exactly these columns. Derived rather than
 * written out, so adding or dropping a column changes what is requested and what
 * is read in a single edit.
 */
function quantitiesFor(names: readonly ColumnName[]): string {
  const codes = new Set(names.map((name) => COLUMNS[name].quantity));
  return [...codes].toSorted((a, b) => a - b).join(',');
}

/**
 * Locate each column in the header row of the response it was requested from,
 * as one `[name, index]` pair per name.
 */
function resolveColumns(
  headers: string[],
  names: readonly ColumnName[],
): [ColumnName, number][] {
  return names.map((name) => {
    const { headerPattern } = COLUMNS[name];
    const index = headers.findIndex((h) => headerPattern.test(h));
    if (index === -1) {
      throw new Error(
        `Column matching ${headerPattern} not found. Headers: ${JSON.stringify(headers)}`,
      );
    }
    return [name, index];
  });
}

/**
 * A uniform grid of rows from `start` to `stop`.
 */
interface TimeWindow {
  /** Window start; converted to UT here (see `toHorizonsUtc`) */
  start: Temporal.ZonedDateTime;
  /** Window end, likewise */
  stop: Temporal.ZonedDateTime;
  stepSize: string;
}

/**
 * One row per instant, sent as a `TLIST` to the second.
 */
interface TimeList {
  instants: Temporal.Instant[];
}

/**
 * What to tabulate and when, short of which columns to send back.
 */
type TableQuery = (TimeWindow | TimeList) & {
  body: Body;
  /**
   * Where the table is computed from: the observing site, or `'geocentric'` for
   * Earth's center.
   */
  site: Site | 'geocentric';
  /** Hands the untouched response body to a caller that wants to show it. */
  onRawResponse?: ((raw: string) => void) | undefined;
};

type ObserverTableQuery = TableQuery & { quantities: string };

/**
 * The time parameters for either kind of query. A `TLIST` excludes the window
 * parameters, and its quotes and spaces have to be percent-encoded.
 */
function timeParams(times: TimeWindow | TimeList): Record<string, string> {
  if ('instants' in times) {
    const list = times.instants
      .map((instant) => `'${instant.toString({ smallestUnit: 'second' }).replace('T', ' ').replace('Z', '')}'`)
      .join(' ');
    return {
      TLIST: list.replaceAll("'", '%27').replaceAll(' ', '%20'),
      TLIST_TYPE: "'CAL'",
      TIME_TYPE: "'UT'",
    };
  }

  return {
    START_TIME: `'${toHorizonsUtc(times.start)}'`,
    STOP_TIME: `'${toHorizonsUtc(times.stop)}'`,
    STEP_SIZE: `'${times.stepSize}'`,
  };
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
  body, site, quantities, onRawResponse, ...times
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
      SITE_COORD: `'${site.longitude},${site.latitude},${site.elevationMeter / 1_000}'`,
    }),
    ...timeParams(times),
    ANG_FORMAT: "'DEG'",
    // APPARENT: "'AIRLESS'", // Request apparent coordinates without atmospheric refraction correction
    QUANTITIES: `'${quantities}'`,
  };

  const query = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
  const url = `${HORIZONS_API_URL}?${query}`;
  const raw = await inHorizonsQueue(async () => {
    console.log(`Calling <${url}>`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Horizons API error: ${res.status} ${res.statusText}`);
    }
    return res.text();
  });

  onRawResponse?.(raw);
  return parseCsvBlock(raw);
}

/**
 * The settled-or-pending tail of every request sent so far.
 */
let horizonsQueueTail: Promise<unknown> = Promise.resolve();

/**
 * Run `request` once every earlier one has settled. Horizons asks for one
 * request at a time, so the rule is kept here rather than by each caller, and
 * callers are free to `Promise.all` their fetches.
 */
function inHorizonsQueue<T>(request: () => Promise<T>): Promise<T> {
  const result = horizonsQueueTail.then(request);
  // A failed request must not stall the ones queued behind it.
  horizonsQueueTail = result.catch(() => {});
  return result;
}

/**
 * One decoded row of an observer table.
 */
interface TableRow<K extends string> {
  /** Row stamp, read as UT (see `parseHorizonsInstant`) */
  at: Temporal.Instant;
  /** The non-empty cells of the flag columns, which have empty headers */
  flags: string[];
  values: Record<K, number>;
}

/**
 * Instants per request. A `TLIST` travels in the URL, and Horizons answers a
 * year's worth of instants (~56) with a 502.
 */
const TLIST_BATCH_SIZE = 10;

/**
 * Split a `TLIST` query into requests of at most `TLIST_BATCH_SIZE` instants.
 * A window query is sent whole.
 */
function batched(query: TableQuery): TableQuery[] {
  if (!('instants' in query)) {
    return [query];
  }

  const { instants, ...rest } = query;
  const batches: TableQuery[] = [];
  for (let i = 0; i < instants.length; i += TLIST_BATCH_SIZE) {
    batches.push({ ...rest, instants: instants.slice(i, i + TLIST_BATCH_SIZE) });
  }
  return batches;
}

/**
 * Fetch exactly the `names` columns for `query` and decode every row, in time
 * order.
 */
async function fetchColumns<K extends ColumnName>(
  query: TableQuery,
  names: readonly K[],
): Promise<TableRow<K>[]> {
  const quantities = quantitiesFor(names);
  const tables = await Promise.all(
    batched(query).map((batch) => requestObserverTable({ ...batch, quantities })),
  );

  return tables.flatMap(({ headers, rows }) => {
    const columnIndex = resolveColumns(headers, names);
    const flagIndices = headers
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => h === '')
      .map(({ i }) => i);

    return rows.map((cols) => ({
      at: parseHorizonsInstant(cell(cols, 0)),
      flags: flagIndices.map((i) => cell(cols, i)).filter((f) => f !== ''),
      // One entry per name in `names`, so this really is `Record<K, number>`;
      // only `Object.fromEntries`'s signature widens the keys back to `string`.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      values: Object.fromEntries(
        columnIndex.map(([name, i]) => [name, numericCell(cols, i)]),
      ) as Record<K, number>,
    }));
  });
}

/**
 * The columns making up an observer-centric Moon ephemeris.
 *
 * Right ascension, declination and sidereal time are requested only to derive
 * `tiltDeg` and are consumed on the way out; the rest are carried through to
 * `MoonEphemeris` as they arrive.
 */
const MOON_EPHEMERIS_COLUMNS = [
  'icrfRightAscensionDeg',
  'icrfDeclinationDeg',
  'azimuthDeg',
  'altitudeDeg',
  'siderealTimeHours',
  'illuminatedPercent',
  'distanceAu',
  'sunPositionAngleDeg',
] as const satisfies ColumnName[];

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
  events: MoonEventName[]; // The events occurring during this row's step, decoded from `flags`
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
 * The events occurring during a row's step, e.g. `['transit', 'sunset']`.
 *
 * Sunrise and sunset have no flag of their own: `*` marks daytime, so the
 * crossing is a change between consecutive rows.
 *
 * @param prevFlags - `undefined` for the first row
 */
function eventsAt(flags: string[], prevFlags: string[] | undefined): MoonEventName[] {
  const names = flags
    .map((flag) => EVENT_FLAGS[flag])
    .filter((name) => name !== undefined);

  const isDay = flags.includes('*');
  if (prevFlags !== undefined && prevFlags.includes('*') !== isDay) {
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
  site: Site,
  start: Temporal.ZonedDateTime,
  stop: Temporal.ZonedDateTime,
  onRawResponse?: (raw: string) => void,
): Promise<MoonEphemeris[]> {
  const rows = await fetchColumns(
    {
      body: 'moon',
      site,
      start,
      stop,
      stepSize: MOON_EPHEMERIS_STEP_SIZE,
      onRawResponse,
    },
    MOON_EPHEMERIS_COLUMNS,
  );

  return rows.map(({ at, flags, values }, i) => ({
    at: at.toZonedDateTimeISO(site.timezone),
    flags,
    events: eventsAt(flags, rows[i - 1]?.flags),
    azimuthDeg: values.azimuthDeg,
    altitudeDeg: values.altitudeDeg,
    illuminatedPercent: values.illuminatedPercent,
    distanceKm: values.distanceAu * AU_TO_KM,
    tiltDeg: moonTilt(
      values.siderealTimeHours,
      values.icrfRightAscensionDeg,
      values.icrfDeclinationDeg,
      site.latitude,
      values.sunPositionAngleDeg,
    ),
  }));
}

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
  const rows = await fetchColumns(
    {
      body,
      // Phase is defined geocentrically, so the observer is Earth's center.
      site: 'geocentric',
      start,
      stop,
      stepSize: ECLIPTIC_LONGITUDE_STEP_SIZE,
    },
    ['eclipticLonDeg'],
  );

  return rows.map(({ at, values }) => ({ at, lonDeg: values.eclipticLonDeg }));
}

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
export interface HorizonsMoonDisc {
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
 * Position angle of the bright limb (Meeus 48.5), 0–360°, from the apparent
 * RA/Dec of the Moon and the Sun in degrees.
 */
function brightLimbPositionAngle(
  moon: Record<typeof APPARENT_EQUATORIAL_COLUMNS[number], number>,
  sun: Record<typeof APPARENT_EQUATORIAL_COLUMNS[number], number>,
): number {
  const rad = Math.PI / 180;
  const [α, δ] = [moon.apparentRightAscensionDeg * rad, moon.apparentDeclinationDeg * rad];
  const [α0, δ0] = [sun.apparentRightAscensionDeg * rad, sun.apparentDeclinationDeg * rad];
  const χ = Math.atan2(
    Math.cos(δ0) * Math.sin(α0 - α),
    Math.sin(δ0) * Math.cos(δ) - Math.cos(δ0) * Math.sin(δ) * Math.cos(α0 - α),
  ) / rad;
  return wrapDeg360(χ);
}

/**
 * Fixed at one hour, with no flag, to match Dial-a-Moon's hourly frames. The
 * disc changes too slowly (the phase angle moves ~0.5°/h) for a finer step to
 * show anything new.
 */
const MOON_DISC_STEP_SIZE = '1h';

/**
 * Fetch the Moon's disc as seen from Earth's center, hourly across a window or
 * at each of a list of instants.
 */
export async function fetchMoonDiscs(
  times: Omit<TimeWindow, 'stepSize'> | TimeList,
): Promise<HorizonsMoonDisc[]> {
  const query: TableQuery = {
    body: 'moon',
    site: 'geocentric',
    ...('instants' in times ? times : { ...times, stepSize: MOON_DISC_STEP_SIZE }),
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

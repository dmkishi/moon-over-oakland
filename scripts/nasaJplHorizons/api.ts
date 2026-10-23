/**
 * The transport layer for NASA JPL's Horizons API: sending an observer-table
 * request and reading the reply back as typed rows.
 * <https://ssd.jpl.nasa.gov/horizons/manual.html>
 *
 * What we ask for and how the reply reads back are two halves of one contract:
 * the quantities requested decide which columns arrive, and the UT window sent
 * is the frame the row labels come back in. `fetchColumns` derives both halves
 * from the one list of column names a query passes, so they cannot drift apart,
 * and each query sees only typed rows.
 */
import type { Site } from './site.ts';

const HORIZONS_API_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';

export const AU_TO_KM = 149_597_870.7;

/**
 * Horizons target body IDs. Bodies are named at every call site rather than
 * given by ID so that transposing two of them is a compile error rather than a
 * silently inverted result.
 */
const BODY_COMMAND = { moon: "'301'", sun: "'10'" };

export type Body = keyof typeof BODY_COMMAND;

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

export type ColumnName = keyof typeof COLUMNS;

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
export interface TimeList {
  instants: Temporal.Instant[];
}

/**
 * What to tabulate and when, short of which columns to send back.
 */
export type TableQuery = (TimeWindow | TimeList) & {
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
export async function fetchColumns<K extends ColumnName>(
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

import { moonTilt } from '../angles.ts';
import { AU_TO_KM, fetchColumns, type ColumnName } from '../api.ts';
import type { ObservingDay, Site } from '../site.ts';

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
 * `MoonEphemeris` per step across the observing day.
 *
 * @param onRawResponse - Receives the untouched response body, for `--show-raw`
 */
export async function fetchMoonEphemeris(
  site: Site,
  day: ObservingDay,
  onRawResponse?: (raw: string) => void,
): Promise<MoonEphemeris[]> {
  const rows = await fetchColumns(
    {
      body: 'moon',
      site,
      start: day.start,
      // One step short of the next day's midnight, which belongs to that day.
      stop: day.end.subtract({ minutes: 1 }),
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
 * Whether a row starts a display interval.
 */
function isIntervalStart(row: MoonEphemeris, intervalMinutes: number): boolean {
  /**
   * True when the row's local wall clock is a whole number of `intervalMinutes`
   * past local midnight.
   *
   * Rows arrive on a uniform absolute-time grid, so taking every Nth one would
   * keep the spacing but lose the anchor: past a DST transition every display
   * time shifts by the offset and stops being a multiple of the interval.
   * Reading the clock holds the anchor, and the two transition days then need
   * no special case — a start time inside a fall-back day's repeated hour comes
   * round twice, and one inside a spring-forward day's skipped hour never
   * arrives at all.
   */
  return (row.at.hour * 60 + row.at.minute) % intervalMinutes === 0;
}

export interface EphemerisDisplayRow {
  row: MoonEphemeris;
  events: { name: MoonEventName; at: Temporal.ZonedDateTime }[];
}

/**
 * Reduces the one-row-per-minute grid to one row per `intervalMinutes`, folding
 * each occurrence into the interval that contains it rather than giving it a
 * row of its own.
 *
 * Events attach to the interval in progress — the most recent display row — so
 * they read forward from it. Walking the run in order rather than bucketing by
 * a computed key is what keeps that true through a DST transition, where a wall
 * clock repeats itself for an hour.
 *
 * An event's own altitude, azimuth and tilt are dropped rather than carried
 * onto its interval's row, which would misreport them by up to a full interval.
 * `printSummary` is where the readings at moonrise and moonset are taken, off
 * the full grid, and `--show-raw` is what still holds every sample.
 *
 * This thins for display only. `computeMoonSummary` keeps the full grid, whose
 * one-minute step is the resolution every reported event time is good to.
 */
export function thinEphemeris(
  moonEphemeris: MoonEphemeris[],
  intervalMinutes: number,
): EphemerisDisplayRow[] {
  const displayRows: EphemerisDisplayRow[] = [];

  for (const row of moonEphemeris) {
    if (isIntervalStart(row, intervalMinutes)) {
      displayRows.push({ row, events: [] });
    }

    // The run begins at local midnight, which starts an interval whatever the
    // width, so one is always in progress by the time an event needs somewhere
    // to go.
    const current = displayRows.at(-1);
    if (current === undefined) continue;

    for (const name of row.events) {
      current.events.push({ name, at: row.at });
    }
  }

  return displayRows;
}

/**
 * Queries the JPL Horizons API for daily Moon position data and summarizes
 * moonrise/moonset times, azimuth, tilt, illumination, and distance.
 *
 * @usage pnpm horizons [YYYY-MM-DD] [--every=<interval>] [--show-table] [--show-csv] [--show-raw] [--no-summary] [--no-json]
 */
import { parseArgs } from 'node:util';
import { Temporal } from '@js-temporal/polyfill';
import pc from 'picocolors';
import { location } from '../../src/constants.ts';
import { queryMoonEphemeris } from './api.ts';
import { parseMoonEphemeris } from './ephemeris.ts';
import { civilDayBounds, type Observer } from './observer.ts';
import { resolvePhaseEvent } from './phaseEvent.ts';
import { printCsv, printFixtureJson, printSummary, printTable, thinEphemeris } from './print.ts';
import { computeMoonSummary } from './summary.ts';

class UsageError extends Error {}

/**
 * The observing day to query, as a `YYYY-MM-DD` string. Defaults to today in
 * the system time zone when the positional argument is omitted.
 */
function parseDateArg(arg: string | undefined): string {
  if (arg === undefined) return Temporal.Now.plainDateISO().toString();

  // `PlainDate.from` alone would accept times, offsets, and calendar
  // annotations, so require the bare calendar date first. Month and day may
  // omit their leading zero (`2000-1-2`).
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(arg);
  if (!match) {
    throw new UsageError(`Expected a YYYY-MM-DD date (leading zero optional), got: ${arg}`);
  }

  const [, year, month, day] = match;

  // `PlainDate.from` only parses the padded ISO form, so pad before handing it
  // over. `reject` so out-of-range days fail instead of being clamped.
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  try {
    return Temporal.PlainDate.from(iso, { overflow: 'reject' }).toString();
  } catch {
    // The regex admits `2026-13-01` and `2026-02-30`; Temporal is what rejects
    // them, in wording ("invalid RFC 9557 string") that is jargon from here.
    throw new UsageError(`No such calendar date: ${arg}`);
  }
}

/**
 * The display interval for `--show-table` and `--show-csv` in minutes. Accepts
 * `1h`, `30m`, or `30` as bare count of minutes.
 */
function parseEveryArg(arg: string | undefined): number {
  if (arg === undefined) return 1;

  const match = /^(\d+)(m|h)?$/.exec(arg);
  if (!match) {
    throw new UsageError(`Expected an interval such as 1h, 30m, or 30, got: ${arg}`);
  }

  const [, count, unit] = match;
  const minutes = Number(count) * (unit === 'h' ? 60 : 1);

  // Zero would select no row at all, and the window is a single day, so nothing
  // beyond 24 hours thins any further than 24 hours already does.
  if (minutes < 1 || minutes > 1440) {
    throw new UsageError(`Interval must fall between 1 minute and 24 hours, got: ${arg}`);
  }

  return minutes;
}

try {
  const {
    values: argValues,
    positionals: argPositionals,
  } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'every':      { type: 'string' },
      'no-json':    { type: 'boolean', default: false },
      'no-summary': { type: 'boolean', default: false },
      'show-csv':   { type: 'boolean', default: false },
      'show-raw':   { type: 'boolean', default: false },
      'show-table': { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });
  const date = parseDateArg(argPositionals[0]);
  const everyMinutes = parseEveryArg(argValues['every']);
  const showJson = !argValues['no-json'];
  const showSummary = !argValues['no-summary'];
  const showCsv = argValues['show-csv'];
  const showRaw = argValues['show-raw'];
  const showTable = argValues['show-table'];

  if (!showSummary && !showJson && !showTable && !showCsv && !showRaw) {
    throw new UsageError(
      'Nothing to print: --no-summary and --no-json together need --show-table, --show-csv, or --show-raw.',
    );
  }
  if (argValues['every'] !== undefined && !showTable && !showCsv) {
    throw new UsageError(
      '--every thins --show-table and --show-csv, and neither was asked for.',
    );
  }

  const observer: Observer = {
    date,
    timeZone: location.timezone,
    lat: location.latitude,
    lon: location.longitude,
    elevationMeter: 20, // Elevation is hardcoded for now
  };

  const day = civilDayBounds(observer);

  const response = await queryMoonEphemeris(
    observer,
    day.start,
    // Stop at the next day's midnight rather than 23:59: that extra row is what
    // lets `findLowerCulmination` bracket a crossing in the day's final minute.
    // `computeMoonSummary` confines every other reading to the day's own rows.
    day.end,
  );
  if (showRaw) console.log(response);

  const moonEphemeris = parseMoonEphemeris(response, observer);

  const phaseEvent = await resolvePhaseEvent(
    observer,
    // This stops at midnight as the last sample, which is needed for the
    // interpolation to find the phase event.
    day,
    moonEphemeris.map((row) => row.illuminatedFraction),
  );

  const moonSummary = computeMoonSummary(moonEphemeris, observer, day, phaseEvent);

  console.log();
  if (showTable || showCsv) {
    const displayRows = thinEphemeris(moonEphemeris, everyMinutes);
    if (showTable) printTable(displayRows);
    if (showCsv) printCsv(displayRows);
  }
  if (showSummary) printSummary(moonSummary, observer, day);
  if (showJson) {
    if (showTable || showCsv || showSummary) console.log();
    printFixtureJson(moonSummary);
  }
} catch (error) {
  // Node's own argument errors — unknown flag, missing value — are usage errors
  // too, so they report the same way. Anything else is a bug or a failed API
  // call, and keeps its stack.
  const isUsage = error instanceof UsageError || (
    error instanceof Error &&
    'code' in error &&
    String(error.code).startsWith('ERR_PARSE_ARGS_')
  );
  if (!isUsage) throw error;

  console.error(pc.red(error.message));
  process.exitCode = 1;
}

/**
 * Queries the JPL Horizons API for daily Moon position data and summarizes
 * moonrise/moonset times, azimuth, tilt, illumination, and distance.
 *
 * @usage pnpm horizons [YYYY-MM-DD] [--show-table] [--show-raw]
 */
import { parseArgs } from 'node:util';
import { Temporal } from '@js-temporal/polyfill';
import { location } from '../../src/constants.ts';
import { queryMoonEphemeris } from './api.ts';
import { parseMoonEphemeris } from './ephemeris.ts';
import { civilDayBounds, type Observer } from './observer.ts';
import { resolvePhaseEvent } from './phaseEvent.ts';
import { printFixtureJson, printSummary, printTable } from './print.ts';
import { computeMoonSummary } from './summary.ts';

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
    throw new Error(`Expected a YYYY-MM-DD date (leading zero optional), got: ${arg}`);
  }

  const [, year, month, day] = match;

  // `PlainDate.from` only parses the padded ISO form, so pad before handing it
  // over. `reject` so out-of-range days fail instead of being clamped.
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return Temporal.PlainDate.from(iso, { overflow: 'reject' }).toString();
}

const {
  values: argValues,
  positionals: argPositionals,
} = parseArgs({
  args: process.argv.slice(2),
  options: {
    'show-raw': { type: 'boolean', default: false },
    'show-table': { type: 'boolean', default: false },
  },
  allowPositionals: true,
});
const date = parseDateArg(argPositionals[0]);
const showRaw = argValues['show-raw'];
const showTable = argValues['show-table'];

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
if (showTable) printTable(moonEphemeris);
printSummary(moonSummary, observer, day);
console.log();
printFixtureJson(moonSummary);

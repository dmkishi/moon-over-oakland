/**
 * @see ../main.ts for usage and subcommand descriptions.
 */
import { parseArgs } from 'node:util';
import { parseDateArg, UsageError } from '../args.ts';
import { civilDay, SITE } from '../site.ts';
import { fetchMoonEphemeris, thinEphemeris } from './ephemeris.ts';
import { resolvePhaseEvent } from './phase-crossing.ts';
import { printCsv, printFixtureJson, printSummary, printTable } from './print.ts';
import { computeMoonSummary } from './summary.ts';

/**
 * The display interval for `--show-table` and `--show-csv` in minutes. Accepts
 * `1h`, `30m`, or `30` as bare count of minutes.
 */
function parseEveryArg(arg: string | undefined): number {
  if (arg === undefined) return 1;

  const match = /^(?<count>\d+)(?<unit>m|h)?$/u.exec(arg);
  if (!match) {
    throw new UsageError(`Expected an interval such as 1h, 30m, or 30, got: ${arg}`);
  }

  const { count, unit } = match.groups!;
  const minutes = Number(count) * (unit === 'h' ? 60 : 1);

  // Zero would select no row at all, and the window is a single day, so nothing
  // beyond 24 hours thins any further than 24 hours already does.
  if (minutes < 1 || minutes > 1_440) {
    throw new UsageError(`Interval must fall between 1 minute and 24 hours, got: ${arg}`);
  }

  return minutes;
}

export async function runSky(argv: string[]): Promise<void> {
  const {
    values: argValues,
    positionals: argPositionals,
  } = parseArgs({
    args: argv,
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
  if (argPositionals.length > 1) {
    throw new UsageError(`Expected at most one date, got: ${argPositionals.join(' ')}`);
  }
  const date = parseDateArg(argPositionals[0]);

  const everyMinutes = parseEveryArg(argValues.every);
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
  if (argValues.every !== undefined && !showTable && !showCsv) {
    throw new UsageError(
      '--every thins --show-table and --show-csv, and neither was asked for.',
    );
  }

  const day = civilDay(date);

  const moonEphemeris = await fetchMoonEphemeris(
    SITE,
    day,
    showRaw ? (raw) => console.log(raw) : undefined,
  );

  const phaseEvent = await resolvePhaseEvent(
    day,
    moonEphemeris.map((row) => row.illuminatedPercent),
  );

  const moonSummary = computeMoonSummary(moonEphemeris, SITE, day, phaseEvent);

  console.log();
  if (showTable || showCsv) {
    const displayRows = thinEphemeris(moonEphemeris, everyMinutes);
    if (showTable) printTable(displayRows);
    if (showCsv) printCsv(displayRows);
  }
  if (showSummary) printSummary(moonSummary);
  if (showJson) {
    if (showTable || showCsv || showSummary) console.log();
    printFixtureJson(moonSummary);
  }
}

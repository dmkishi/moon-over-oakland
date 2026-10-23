/**
 * Queries the JPL Horizons API for authoritative Moon data, for debugging and
 * test fixtures.
 *
 * `sky` summarizes Oakland's view of the Moon over one civil day, i.e.
 * moonrise/moonset with azimuth and tilt, transit, sunrise/sunset, any
 * principal phase, and noon illumination and distance, plus a fixture row.
 * @usage pnpm horizons sky [YYYY-MM-DD] [--every=<interval>] [--show-table]
 *        [--show-csv] [--show-raw] [--no-summary] [--no-json]
 *
 * `disc` prints the geocentric view of the Moon's face, as rows for
 * `tests/fixtures/moon-disc.accuracy.jsonc`. A day gets hourly `sample` rows
 * plus any phase instant in it; a year gets only its phase instants.
 * @usage pnpm horizons disc [YYYY-MM-DD | YYYY]
 */
import pc from 'picocolors';
import { UsageError } from './args.ts';
import { runDisc } from './disc/command.ts';
import { runSky } from './sky/command.ts';

try {
  const [subcommand, ...argv] = process.argv.slice(2);
  switch (subcommand) {
    case 'sky':
      await runSky(argv);
      break;
    case 'disc':
    case 'disk':
      await runDisc(argv);
      break;
    case undefined:
      throw new UsageError('Expected a subcommand: sky or disc.');
    default:
      throw new UsageError(`Unknown subcommand: ${subcommand}. Expected sky or disc.`);
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

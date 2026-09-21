import { parseArgs } from 'node:util';

/**
 * Parse the optional date positional, throwing on anything that is not a real
 * `YYYY-MM-DD` day. A missing or empty argument means "no date given".
 *
 * @example
 * parseDateArg(undefined); // undefined
 * parseDateArg(''); // undefined
 * parseDateArg('1999-01-31'); // PlainDate 1999-01-31
 * parseDateArg('1999-1-31'); // PlainDate 1999-01-31
 * parseDateArg('1999-02-30'); // throws Error: Invalid date: "1999-02-30"
 * parseDateArg('1999-01-31T12:00:00Z'); // throws Error
 *
 * @pure
 */
function parseDateArg(arg: string | undefined): Temporal.PlainDate | undefined {
  if (arg === undefined || arg === '') return undefined;

  // `PlainDate.from` alone would accept times, offsets, and calendar
  // annotations, so require the bare calendar date first. Month and day may
  // omit their leading zero (`1999-1-31`).
  const match = /^(?<year>\d{4})-(?<month>\d{1,2})-(?<day>\d{1,2})$/u.exec(arg);
  if (!match?.groups) {
    throw new Error(`Invalid date: "${arg}"`);
  }

  const { year, month, day } = match.groups;
  const iso = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  try {
    return Temporal.PlainDate.from(iso, { overflow: 'reject' });
  } catch {
    throw new Error(`Invalid date: "${arg}"`);
  }
}

/**
 * Read the command line:
 * - an optional date to post for (defaulting to today, signalled by `undefined`)
 * - an optional `--test` flag, selecting the test account's credentials
 * - an optional `--dry-run` flag
 *
 * @example
 * parseCliArgs([]); // { date: undefined, isTest: false, isDryRun: false }
 * parseCliArgs(['--dry-run']); // { date: undefined, isTest: false, isDryRun: true }
 * parseCliArgs(['--test']); // { date: undefined, isTest: true, isDryRun: false }
 * parseCliArgs(['1999-01-31']); // { date: PlainDate 1999-01-31, isTest: false, isDryRun: false }
 * parseCliArgs(['1999-01-31', '--dry-run']); // { date: PlainDate 1999-01-31, isTest: false, isDryRun: true }
 * parseCliArgs(['1999-01-31', '1999-02-01']); // throws Error: Too many arguments
 * parseCliArgs(['--nope']); // throws Error (unknown option)
 */
export function parseCliArgs(args: string[] = process.argv.slice(2)): {
  date: Temporal.PlainDate | undefined;
  isTest: boolean;
  isDryRun: boolean;
} {
  const { positionals, values } = parseArgs({
    args,
    options: {
      'test': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (positionals.length > 1) {
    throw new Error(`Too many arguments`);
  }

  return {
    date: parseDateArg(positionals[0]),
    isTest: values.test,
    isDryRun: values['dry-run'],
  };
}

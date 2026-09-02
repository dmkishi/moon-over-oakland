import { parseArgs } from 'node:util';
import { Temporal } from 'temporal-polyfill/implementation';

function parseDate(value: string): Temporal.PlainDate {
  // `PlainDate.from` alone would accept times, offsets, and calendar
  // annotations, so require the bare calendar date first. Month and day may
  // omit their leading zero (`2000-1-31`).
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid date: "${value}"`);
  }

  const [, year, month, day] = match;
  const iso = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  try {
    return Temporal.PlainDate.from(iso, { overflow: 'reject' });
  } catch {
    throw new Error(`Invalid date: "${value}"`);
  }
}

export function parseCliArgs(args: string[] = process.argv.slice(2)): {
  date: Temporal.PlainDate | undefined;
  isDryRun: boolean;
} {
  const { positionals, values } = parseArgs({
    args,
    options: {
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (positionals.length > 1) {
    throw new Error(`Too many arguments`);
  }

  const dateArg = positionals[0];

  return {
    date: dateArg ? parseDate(dateArg) : undefined,
    isDryRun: values['dry-run'],
  };
}

import { parseArgs } from 'node:util';
import { Temporal } from '@js-temporal/polyfill';

function parseDate(value: string): Temporal.PlainDate {
  try {
    return Temporal.PlainDate.from(value, { overflow: 'reject' });
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

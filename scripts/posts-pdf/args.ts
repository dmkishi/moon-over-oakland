/**
 * The command line of `pnpm posts-pdf`, and the error that reports a bad one
 * without a stack trace.
 */
import { parseArgs } from 'node:util';
import { observer } from '../../src/observer.ts';

export class UsageError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/**
 * Read the command line:
 * - an optional `YYYY` year, defaulting to the current year in Oakland
 * - an optional `--out <path>` for the PDF, defaulting to
 *   `moon-over-oakland-<year>.pdf` in the current directory
 * - an optional `--html` flag, keeping the HTML the PDF is printed from beside
 *   it
 *
 * @example
 * parsePostsPdfArgs([], 2026); // { year: 2026, out: 'moon-over-oakland-2026.pdf', isHtmlKept: false }
 * parsePostsPdfArgs(['2027', '--html']); // { year: 2027, out: 'moon-over-oakland-2027.pdf', isHtmlKept: true }
 * parsePostsPdfArgs(['27']); // Throws UsageError
 */
export function parsePostsPdfArgs(
  args: string[],
  currentYear: number = Temporal.Now.plainDateISO(observer.timezone).year,
): { year: number; out: string; isHtmlKept: boolean } {
  const { positionals, values } = parseArgs({
    args,
    options: {
      out: { type: 'string', short: 'o' },
      html: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (positionals.length > 1) {
    throw new UsageError('Too many arguments. Expected at most one YYYY year.');
  }

  const [yearArg] = positionals;
  if (yearArg !== undefined && !/^\d{4}$/u.test(yearArg)) {
    throw new UsageError(`Expected a YYYY year, got: ${yearArg}`);
  }
  const year = yearArg === undefined ? currentYear : Number(yearArg);

  if (values.out === '') {
    throw new UsageError('Expected a path after --out.');
  }

  return {
    year,
    out: values.out ?? `moon-over-oakland-${year}.pdf`,
    isHtmlKept: values.html,
  };
}

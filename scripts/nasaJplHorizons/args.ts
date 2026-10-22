/**
 * Positional arguments shared by the subcommands, and the error that reports
 * a bad one without a stack trace.
 */

export class UsageError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/**
 * A `YYYY-MM-DD` date (leading zero optional), defaulting to today in the
 * system time zone.
 */
export function parseDateArg(arg: string | undefined): string {
  if (arg === undefined) return Temporal.Now.plainDateISO().toString();

  // `PlainDate.from` alone would accept times, offsets, and calendar
  // annotations, so require the bare calendar date first. Month and day may
  // omit their leading zero (`2000-1-31`).
  const match = /^(?<year>\d{4})-(?<month>\d{1,2})-(?<day>\d{1,2})$/u.exec(arg);
  if (!match) {
    throw new UsageError(`Expected a YYYY-MM-DD date (leading zero optional), got: ${arg}`);
  }

  const { year, month, day } = match.groups!;

  // `PlainDate.from` only parses the padded ISO form, so pad before handing it
  // over. `reject` so out-of-range days fail instead of being clamped.
  const iso = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  try {
    return Temporal.PlainDate.from(iso, { overflow: 'reject' }).toString();
  } catch {
    // The regex admits `2026-13-01` and `2026-02-30`; Temporal is what rejects
    // them, in wording ("invalid RFC 9557 string") that is jargon from here.
    throw new UsageError(`No such calendar date: ${arg}`);
  }
}

type DayOrYear =
  | { kind: 'day'; date: string }
  | { kind: 'year'; year: number };

/**
 * A `YYYY` year or a `YYYY-MM-DD` date, defaulting to today.
 */
export function parseDayOrYearArg(arg: string | undefined): DayOrYear {
  if (arg !== undefined && /^\d{4}$/u.test(arg)) return { kind: 'year', year: Number(arg) };

  try {
    return { kind: 'day', date: parseDateArg(arg) };
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    throw new UsageError(`Expected a YYYY-MM-DD date or a YYYY year, got: ${arg}`);
  }
}

/**
 * @see ../main.ts for usage and subcommand descriptions.
 */
import { parseArgs } from 'node:util';
import { findNextPhases, PHASE_TYPES, type PhaseType } from '../../../src/ephemeris/phase.ts';
import { parseDayOrYearArg, UsageError } from '../args.ts';
import { civilDay, type ObservingDay } from '../site.ts';
import { fetchMoonDiscs, printMoonDiscFixture } from './moon-disc.ts';

/**
 * Every principal phase instant from `start` up to `end`, in order, from the
 * same `astronomia` phase functions the bot posts with. Horizons supplies the
 * disc at each instant, so the instants only have to be phases, not exact ones.
 */
function phasesBetween(
  start: Temporal.ZonedDateTime,
  end: Temporal.ZonedDateTime,
): { type: PhaseType; instant: Temporal.Instant }[] {
  const phases: { type: PhaseType; instant: Temporal.Instant }[] = [];
  let after = start;
  for (;;) {
    const next = findNextPhases(after, start.timeZoneId);
    const type = PHASE_TYPES.reduce((a, b) => Temporal.ZonedDateTime.compare(next[a], next[b]) <= 0 ? a : b);
    if (Temporal.ZonedDateTime.compare(next[type], end) >= 0) return phases;
    phases.push({ type, instant: next[type].toInstant() });
    after = next[type];
  }
}

export async function runDisc(argv: string[]): Promise<void> {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true });
  if (positionals.length > 1) {
    throw new UsageError(`Expected at most one date or year, got: ${positionals.join(' ')}`);
  }
  const arg = parseDayOrYearArg(positionals[0]);

  const day: ObservingDay = arg.kind === 'day'
    ? civilDay(arg.date)
    : {
      start: civilDay(new Temporal.PlainDate(arg.year, 1, 1)).start,
      end: civilDay(new Temporal.PlainDate(arg.year, 12, 31)).end,
    };

  const samples = arg.kind === 'day' ? await fetchMoonDiscs(day) : [];

  const phases = phasesBetween(day.start, day.end);
  const phaseDiscs = await fetchMoonDiscs({ instants: phases.map(({ instant }) => instant) });
  if (phaseDiscs.length !== phases.length) {
    throw new Error(`Asked Horizons for ${phases.length} instants, got ${phaseDiscs.length} rows`);
  }

  const rows = [
    ...samples.map((disc) => ({ description: 'sample', disc })),
    ...phases.map(({ type }, i) => ({ description: type, disc: phaseDiscs[i]! })),
  ].toSorted((a, b) => Temporal.Instant.compare(a.disc.at, b.disc.at));

  console.error();
  printMoonDiscFixture(rows);
}

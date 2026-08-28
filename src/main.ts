import { Temporal } from '@js-temporal/polyfill';
import pc from 'picocolors';
import { parseCliArgs } from './args.ts';
import { createBlueskyClient, graphemeLength, MAX_GRAPHEMES } from './bluesky.ts';
import { env } from './env.ts';
import { observer } from './observer.ts';
import { calculatePhaseEvent } from './phase-event.ts';
import { renderPost } from './render.ts';

const GRAPHEME_COUNT_MARGIN = 15;

/**
 * Format a value alongside the alternatives it was chosen from, e.g.
 * `"today" | "tomorrow"`. The alternatives are dimmed, emphasizing the given
 * value.
 */
function formatChoice<T extends string>(value: T, options: readonly T[]): string {
  return options
    .map((option) => (option === value ? `"${option}"` : pc.dim(`"${option}"`)))
    .join(pc.dim(' | '));
}

/**
 * Format a date in its own time zone, e.g. "2020-1-31". The date is dimmed when
 * it falls on `reference`, so only the dates that differ stand out.
 */
function formatLocalDate(
  date: Temporal.PlainDate | Temporal.ZonedDateTime,
  reference?: Temporal.PlainDate,
): string {
  const formatted = `${date.year}-${date.month}-${date.day}`;
  const isReference = reference !== undefined
    && date.year === reference.year
    && date.month === reference.month
    && date.day === reference.day;
  return isReference ? pc.dim(formatted) : formatted;
}

/**
 * Format a zoned instant in its own time zone, e.g. "2020-1-31 2:30 AM".
 */
function formatLocal(zoned: Temporal.ZonedDateTime, reference?: Temporal.PlainDate): string {
  const hour = zoned.hour % 12 || 12;
  const minute = String(zoned.minute).padStart(2, '0');
  const meridiem = zoned.hour < 12 ? 'AM' : 'PM';
  return `${formatLocalDate(zoned, reference)} ${hour}:${minute} ${meridiem}`;
}

/**
 * Format a delta with an explicit sign, e.g. "+42" or "-42".
 */
function formatSigned(minutes: number): string {
  return minutes > 0 ? `+${minutes}` : String(minutes);
}

function parseCliArgsOrExit(): ReturnType<typeof parseCliArgs> {
  try {
    return parseCliArgs();
  } catch (error) {
    console.error(pc.red(error instanceof Error ? error.message : String(error)));
    console.error('Usage: node src/main.ts [YYYY-MM-DD] [--dry-run]');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const { date, isDryRun } = parseCliArgsOrExit();
  const observerDate = date ?? Temporal.Now.plainDateISO(observer.timezone);

  console.log(); // Empty line break
  console.log('Moon Over Oakland');
  console.log('================================================================================');
  console.log(`Date:    ${formatLocalDate(observerDate)} (${observer.timezone})`);
  console.log(`Dry run: ${isDryRun ? pc.yellow('true') : 'false'}`);

  const phaseEvent = calculatePhaseEvent(
    observerDate,
    observer.timezone,
    observer.latitude,
    observer.longitude,
  );

  if (phaseEvent === null) {
    console.log(); // Empty line break
    console.log(pc.red('No principal phase event. Nothing to post.'));
    return;
  }

  console.log('Data:');
  console.log(`  Phase Type:      ${formatChoice(phaseEvent.phaseType, ['new', 'first-quarter', 'full', 'last-quarter'])}`);
  console.log(`  Event Day:       ${formatChoice(phaseEvent.eventDay, ['today', 'tomorrow'])}`);
  console.log('  Events:');
  console.log(`    Phase Instant: ${formatLocal(phaseEvent.events.phase, observerDate)}`);
  console.log(`    Moonrise:      ${formatLocal(phaseEvent.events.moonRise, observerDate)}`);
  console.log(`    Moonset:       ${formatLocal(phaseEvent.events.moonSet, observerDate)}`);
  console.log(`    Sunrise:       ${formatLocal(phaseEvent.events.sunRise, observerDate)}`);
  console.log(`    Sunset:        ${formatLocal(phaseEvent.events.sunSet, observerDate)}`);
  console.log('  Deltas (minutes):');
  console.log(`    Moonrise:      ${formatSigned(phaseEvent.eventDeltas.riseMinutes)}`);
  console.log(`    Moonset:       ${formatSigned(phaseEvent.eventDeltas.setMinutes)}`);
  console.log('  Next Phases:');
  console.log(`    New:           ${formatLocalDate(phaseEvent.nextPhases.new)}`);
  console.log(`    First Quarter: ${formatLocalDate(phaseEvent.nextPhases.firstQuarter)}`);
  console.log(`    Full:          ${formatLocalDate(phaseEvent.nextPhases.full)}`);
  console.log(`    Last Quarter:  ${formatLocalDate(phaseEvent.nextPhases.lastQuarter)}`);
  console.log(); // Empty line break

  const content = await renderPost(phaseEvent, observer.timezone);
  const graphemes = graphemeLength(content);
  const graphemeCount = MAX_GRAPHEMES - graphemes < GRAPHEME_COUNT_MARGIN
    ? pc.yellow(String(graphemes))
    : String(graphemes);

  console.log(`Post (${graphemeCount}/${MAX_GRAPHEMES} graphemes):`);
  console.log('--------------------------------------------------------------------------------');
  console.log(pc.blue(content));
  console.log('--------------------------------------------------------------------------------');
  console.log(); // Empty line break

  if (graphemes > MAX_GRAPHEMES) {
    throw new Error(`Post is ${graphemes} graphemes, over Bluesky's limit of ${MAX_GRAPHEMES}.`);
  }

  if (isDryRun) {
    console.log(pc.yellow('Dry run: skipping actual post.'));
    return;
  }

  const client = await createBlueskyClient(
    env.bluesky.handle,
    env.bluesky.appPassword,
    observer.timezone,
  );
  const result = await client.post(content);
  if (result.status === 'skipped') {
    console.log(pc.yellow('Already posted today: skipping.'));
    return;
  }
  console.log(pc.green('Posted successfully!'));
  console.log(`URI: ${result.uri}`);
}

main().catch((error) => {
  console.error(pc.red('Fatal error:'), error);
  process.exit(1);
});

import { Temporal } from '@js-temporal/polyfill';
import pc from 'picocolors';
import { parseCliArgs } from './args.ts';
import { createBlueskyClient, graphemeLength, MAX_GRAPHEMES } from './bluesky.ts';
import { env } from './env.ts';
import { observer } from './observer.ts';
import { calculatePhaseEvent } from './phase-event.ts';
import { renderPost } from './render.ts';

/**
 * Format a zoned instant's date in its own time zone, e.g. "2020-1-31".
 */
function formatLocalDate(zoned: Temporal.ZonedDateTime): string {
  return `${zoned.year}-${zoned.month}-${zoned.day}`;
}

/**
 * Format a zoned instant in its own time zone, e.g. "2020-1-31 2:30 AM".
 */
function formatLocal(zoned: Temporal.ZonedDateTime): string {
  const hour = zoned.hour % 12 || 12;
  const minute = String(zoned.minute).padStart(2, '0');
  const meridiem = zoned.hour < 12 ? 'AM' : 'PM';
  return `${formatLocalDate(zoned)} ${hour}:${minute} ${meridiem}`;
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

  console.log('Moon Over Oakland');
  console.log('================================================================================');
  console.log(`Date:    ${observerDate} (${observer.timezone})`);
  console.log(`Dry run: ${isDryRun}`);

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
  console.log(`  Phase Type: "${phaseEvent.phaseType}"`);
  console.log(`  Event Day:  "${phaseEvent.eventDay}"`);
  console.log('  Events:');
  console.log(`    Phase Instant: ${formatLocal(phaseEvent.events.phase)}`);
  console.log(`    Moonrise:      ${formatLocal(phaseEvent.events.moonRise)}`);
  console.log(`    Moonset:       ${formatLocal(phaseEvent.events.moonSet)}`);
  console.log(`    Sunrise:       ${formatLocal(phaseEvent.events.sunRise)}`);
  console.log(`    Sunset:        ${formatLocal(phaseEvent.events.sunSet)}`);
  console.log('  Next Phases:');
  console.log(`    New:           ${formatLocalDate(phaseEvent.nextPhases.new)}`);
  console.log(`    First Quarter: ${formatLocalDate(phaseEvent.nextPhases.firstQuarter)}`);
  console.log(`    Full:          ${formatLocalDate(phaseEvent.nextPhases.full)}`);
  console.log(`    Last Quarter:  ${formatLocalDate(phaseEvent.nextPhases.lastQuarter)}`);
  console.log(); // Empty line break

  const content = await renderPost(phaseEvent, observer.timezone);
  const graphemes = graphemeLength(content);
  console.log(`Post (${graphemes}/${MAX_GRAPHEMES} graphemes):`);
  console.log('--------------------------------------------------------------------------------');
  console.log(content);
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

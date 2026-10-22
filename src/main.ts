import { writeFile } from 'node:fs/promises';
import pc from 'picocolors';
import { parseCliArgs } from './args.ts';
import { createBlueskyClient, graphemeLength, MAX_GRAPHEMES, type PostImage } from './bluesky.ts';
import { moonDisc } from './ephemeris/moon-disc.ts';
import { loadEnv } from './env.ts';
import type { EventDelta } from './event-delta.ts';
import { loadMoonTextures, MAX_IMAGE_BYTES, renderMoonImage } from './moon-image.ts';
import { createMonitor } from './monitor.ts';
import { observer } from './observer.ts';
import { calculatePhaseEvent, type PhaseEvent } from './phase-event.ts';
import { renderAltText, renderPost } from './post.ts';

// Load `.env` into `process.env` without overriding variables already set, so
// secrets injected by the host win. Unlike dotenv, a missing file throws.
try {
  process.loadEnvFile();
} catch {
  // No `.env` file: rely on the ambient environment.
}

const GRAPHEME_COUNT_MARGIN = 15;
const IMAGE_BYTES_MARGIN = .1;

/**
 * E.g. "1,234 KB".
 * @pure
 */
function formatKb(bytes: number): string {
  return `${Math.round(bytes / 1_000).toLocaleString('en-US')} KB`;
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
function formatLocal(zoned: Temporal.ZonedDateTime, reference: Temporal.PlainDate): string {
  const hour = zoned.hour % 12 || 12;
  const minute = String(zoned.minute).padStart(2, '0');
  const meridiem = zoned.hour < 12 ? 'AM' : 'PM';
  return `${formatLocalDate(zoned, reference)} ${hour}:${minute} ${meridiem}`;
}

/**
 * Format a delta with an explicit sign, e.g. "+42" or "-42".
 * @pure
 */
function formatSigned(minutes: number): string {
  return minutes > 0 ? `+${minutes}` : String(minutes);
}

/**
 * Place a delta relative to its reference, e.g. "before sunrise", "after noon",
 * "at midnight", etc.
 * @pure
 */
function formatRelation({ minutes, reference }: EventDelta): string {
  if (minutes === 0) return `at ${reference}`;
  return `${minutes > 0 ? 'after' : 'before'} ${reference}`;
}

function parseCliArgsOrExit(): ReturnType<typeof parseCliArgs> {
  try {
    return parseCliArgs();
  } catch (error) {
    console.error(pc.red(error instanceof Error ? error.message : String(error)));
    console.error('Usage: node src/main.ts [YYYY-MM-DD] [--test] [--dry-run] [--image=<path>]');
    return process.exit(1);
  }
}

/**
 * Create moon image at the phase instant as a JPEG with its alt text.
 * Optionally saves it to `imagePath`.
 */
async function createPostImage(phaseEvent: PhaseEvent, imagePath: string | undefined): Promise<PostImage> {
  const start = performance.now();
  const disc = moonDisc(phaseEvent.time.toInstant());
  const textures = await loadMoonTextures();
  const image = await renderMoonImage(disc, textures, { earthshine: phaseEvent.type === 'new' });
  const seconds = ((performance.now() - start) / 1_000).toFixed(1);

  const size = MAX_IMAGE_BYTES - image.jpeg.byteLength < MAX_IMAGE_BYTES * IMAGE_BYTES_MARGIN
    ? pc.yellow(formatKb(image.jpeg.byteLength))
    : formatKb(image.jpeg.byteLength);
  console.log(`Image (${image.width} × ${image.height} px, ${size}/${formatKb(MAX_IMAGE_BYTES)}, ${seconds} s)`);

  const alt = renderAltText(phaseEvent, disc.illuminatedFraction, observer.timezone);
  console.log(`  Alt: ${pc.blue(alt)}`);

  if (imagePath !== undefined) {
    await writeFile(imagePath, image.jpeg);
    console.log(`  Written to ${imagePath}`);
  }
  console.log(); // Empty line break

  return { ...image, alt };
}

/**
 * @returns If the run was degraded: the image failed and only the text was
 * posted.
 */
async function main({ date, isTest, isDryRun, imagePath }: ReturnType<typeof parseCliArgs>): Promise<boolean> {
  const observerDate = date ?? Temporal.Now.plainDateISO(observer.timezone);

  console.log(); // Empty line break
  console.log('Moon Over Oakland');
  console.log('================================================================================');
  console.log(`Date:    ${formatLocalDate(observerDate)} (${observer.timezone})`);
  console.log(`Account: ${isTest ? pc.yellow('test') : 'production'}`);
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
    return false;
  }

  console.log('Data:');
  console.log(`  Phase Type:      ${phaseEvent.type}`);
  console.log(`  Phase Instant:   ${formatLocal(phaseEvent.time, observerDate)} (${phaseEvent.day})`);
  console.log('  Events:');
  console.log('    Moon:');
  console.log(`      Rise:        ${formatLocal(phaseEvent.dayEvents.moonrise, observerDate)}`);
  console.log(`      Set:         ${formatLocal(phaseEvent.dayEvents.moonset, observerDate)}`);
  console.log('    Sun:');
  console.log(`      Rise:        ${formatLocal(phaseEvent.dayEvents.sunrise, observerDate)}`);
  console.log(`      Set:         ${formatLocal(phaseEvent.dayEvents.sunset, observerDate)}`);
  console.log('    Deltas (minutes):');
  // Two lines below start one column left of all other values so the sign hangs
  // and the digits remain aligned.
  console.log(`      Moonrise ∆: ${formatSigned(phaseEvent.eventDeltas.moonrise.minutes)} (${formatRelation(phaseEvent.eventDeltas.moonrise)})`);
  console.log(`      Moonset ∆:  ${formatSigned(phaseEvent.eventDeltas.moonset.minutes)} (${formatRelation(phaseEvent.eventDeltas.moonset)})`);
  console.log('  Next Phases:');
  console.log(`    New:           ${formatLocalDate(phaseEvent.nextPhases['new'])}`);
  console.log(`    First Quarter: ${formatLocalDate(phaseEvent.nextPhases['first-quarter'])}`);
  console.log(`    Full:          ${formatLocalDate(phaseEvent.nextPhases['full'])}`);
  console.log(`    Last Quarter:  ${formatLocalDate(phaseEvent.nextPhases['last-quarter'])}`);
  console.log(); // Empty line break

  const content = renderPost(phaseEvent, observer.timezone);
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

  // A post without its image beats no post, so a failed image is logged and
  // only the text is posted. Dry runs render too, so the smoke test exercises
  // the image.
  let image: PostImage | undefined;
  try {
    image = await createPostImage(phaseEvent, imagePath);
  } catch (error) {
    console.error(pc.red('Image failed. Posting the text alone:'), error);
    console.log(); // Empty line break
  }
  const isDegraded = image === undefined;

  if (isDryRun) {
    console.log(pc.yellow('Dry run: skipping actual post.'));
    return isDegraded;
  }

  const env = loadEnv(process.env, isTest ? 'test' : 'production');
  const client = await createBlueskyClient(
    env.bluesky.handle,
    env.bluesky.appPassword,
    observer.timezone,
    { checkPostedToday: !isTest },
  );
  const result = await client.post(content, image);
  if (result.status === 'skipped') {
    console.log(pc.yellow('Already posted today: skipping.'));
    return isDegraded;
  }
  console.log(isDegraded ? pc.yellow('Posted without the image.') : pc.green('Posted successfully!'));
  console.log(`Account: @${env.bluesky.handle}`);
  console.log(`URI: ${result.uri}`);
  return isDegraded;
}

const args = parseCliArgsOrExit();
const monitor = createMonitor(
  (args.isTest || args.isDryRun) ? undefined : process.env.HEALTHCHECKS_URL,
);
await monitor.start();

try {
  const isDegraded = await main(args);
  if (isDegraded) {
    await monitor.fail();
    // - Dry run exits 1: it has posted nothing, so it fails the smoke test.
    // - Live run exits 0: the text is posted, and a nonzero exit would make
    //   `run.sh` retry, find today's post, skip it, and ping success over this
    //   failure.
    process.exitCode = args.isDryRun ? 1 : 0;
  } else {
    await monitor.success();
  }
} catch (error) {
  console.error(pc.red('Fatal error:'), error);
  await monitor.fail();
  process.exit(1);
}

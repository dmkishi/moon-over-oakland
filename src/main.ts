import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
import { renderInlineImage, supportsInlineImages } from './terminal-image.ts';

// Load `.env` into `process.env` without overriding variables already set, so
// secrets injected by the host win. Unlike dotenv, a missing file throws.
try {
  process.loadEnvFile();
} catch {
  // No `.env` file: rely on the ambient environment.
}

const GRAPHEME_COUNT_MARGIN = 15;
const IMAGE_BYTES_MARGIN = .1;

type Log = typeof console.log;
type TimedPostImage = PostImage & { seconds: number };

const noop: Log = () => {};

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
    console.error('Usage: node src/main.ts [YYYY-MM-DD] [--test] [--dry-run] [--summary]');
    return process.exit(1);
  }
}

/**
 * Create moon image at the phase instant as a JPEG with its alt text, and the
 * seconds it took. Optionally:
 * - saves it to `imagePath`
 * - shows it inline in the terminal when `isPreviewShown`
 */
async function createPostImage(
  phaseEvent: PhaseEvent,
  {
    imagePath,
    isPreviewShown,
    report,
  }: {
    imagePath: string | undefined,
    isPreviewShown: boolean,
    report: Log,
  },
): Promise<TimedPostImage> {
  const start = performance.now();
  const disc = moonDisc(phaseEvent.time.toInstant());
  const textures = await loadMoonTextures();
  const image = await renderMoonImage(disc, textures, { earthshine: phaseEvent.type === 'new' });
  const seconds = (performance.now() - start) / 1_000;

  const size = MAX_IMAGE_BYTES - image.jpeg.byteLength < MAX_IMAGE_BYTES * IMAGE_BYTES_MARGIN
    ? pc.yellow(formatKb(image.jpeg.byteLength))
    : formatKb(image.jpeg.byteLength);
  report(`Image (${image.width} × ${image.height} px, ${size}/${formatKb(MAX_IMAGE_BYTES)}, ${seconds.toFixed(1)} s)`);

  const alt = renderAltText(phaseEvent, disc.illuminatedFraction, observer.timezone);
  report(`- Alt: ${pc.blue(alt)}`);

  // A write or preview that fails must not mark the run degraded, which fails a
  // dry run.
  if (imagePath !== undefined) {
    try {
      await mkdir(dirname(imagePath), { recursive: true });
      await writeFile(imagePath, image.jpeg);
      report(`- Written to ${imagePath}`);
    } catch (error) {
      console.error(pc.yellow('Image write failed:'), error);
    }
  }
  report(); // Empty line break

  if (isPreviewShown) {
    try {
      process.stdout.write(`${await renderInlineImage(image.jpeg)}\n`);
    } catch (error) {
      console.error(pc.yellow('Preview failed:'), error);
    }
  }

  return { ...image, alt, seconds };
}

/**
 * Summarize a post for the log.
 * @pure
 */
function summarizePost(
  type: PhaseEvent['type'],
  graphemes: number,
  image: TimedPostImage | undefined,
): string {
  if (image === undefined) return `${type} without the image, ${graphemes} graphemes`;
  return `${type}, ${graphemes} graphemes, image ${formatKb(image.jpeg.byteLength)} in ${image.seconds.toFixed(1)} s`;
}

/**
 * @returns If the run was degraded: the image failed and only the text was
 * posted.
 */
async function main({ date, isTest, isDryRun, isSummary }: ReturnType<typeof parseCliArgs>): Promise<boolean> {
  const observerDate = date ?? Temporal.Now.plainDateISO(observer.timezone);

  // `--summary` swaps the report for a single-line log entry.
  const report: Log = isSummary ? noop : console.log;
  const summary: Log = isSummary ? console.log : noop;

  report(); // Empty line break
  report('Moon Over Oakland');
  report('================================================================================');
  report(`Date:    ${formatLocalDate(observerDate)} (${observer.timezone})`);
  report(`Account: ${isTest ? pc.yellow('test') : 'production'}`);
  report(`Dry run: ${isDryRun ? pc.yellow('true') : 'false'}`);

  const phaseEvent = calculatePhaseEvent(
    observerDate,
    observer.timezone,
    observer.latitude,
    observer.longitude,
  );

  if (phaseEvent === null) {
    report(); // Empty line break
    report(pc.red('No principal phase event. Nothing to post.'));
    summary('no phase event');
    return false;
  }

  report('Data:');
  report(`  Phase Type:      ${phaseEvent.type}`);
  report(`  Phase Instant:   ${formatLocal(phaseEvent.time, observerDate)} (${phaseEvent.day})`);
  report('  Events:');
  report('    Moon:');
  report(`      Rise:        ${formatLocal(phaseEvent.dayEvents.moonrise, observerDate)}`);
  report(`      Set:         ${formatLocal(phaseEvent.dayEvents.moonset, observerDate)}`);
  report('    Sun:');
  report(`      Rise:        ${formatLocal(phaseEvent.dayEvents.sunrise, observerDate)}`);
  report(`      Set:         ${formatLocal(phaseEvent.dayEvents.sunset, observerDate)}`);
  report('    Deltas (minutes):');
  // Two lines below start one column left of all other values so the sign hangs
  // and the digits remain aligned.
  report(`      Moonrise ∆: ${formatSigned(phaseEvent.eventDeltas.moonrise.minutes)} (${formatRelation(phaseEvent.eventDeltas.moonrise)})`);
  report(`      Moonset ∆:  ${formatSigned(phaseEvent.eventDeltas.moonset.minutes)} (${formatRelation(phaseEvent.eventDeltas.moonset)})`);
  report('  Next Phases:');
  report(`    New:           ${formatLocalDate(phaseEvent.nextPhases['new'])}`);
  report(`    First Quarter: ${formatLocalDate(phaseEvent.nextPhases['first-quarter'])}`);
  report(`    Full:          ${formatLocalDate(phaseEvent.nextPhases['full'])}`);
  report(`    Last Quarter:  ${formatLocalDate(phaseEvent.nextPhases['last-quarter'])}`);
  report(); // Empty line break

  const content = renderPost(phaseEvent, observer.timezone);
  const graphemes = graphemeLength(content);
  const graphemeCount = MAX_GRAPHEMES - graphemes < GRAPHEME_COUNT_MARGIN
    ? pc.yellow(String(graphemes))
    : String(graphemes);

  report(`Post (${graphemeCount}/${MAX_GRAPHEMES} graphemes):`);
  report('--------------------------------------------------------------------------------');
  report(pc.blue(content));
  report('--------------------------------------------------------------------------------');
  report(); // Empty line break

  if (graphemes > MAX_GRAPHEMES) {
    throw new Error(`Post is ${graphemes} graphemes, over Bluesky's limit of ${MAX_GRAPHEMES}.`);
  }

  const isImageSaved = isDryRun && !isSummary;
  const imagePath = isImageSaved
    ? join(tmpdir(), 'moon-over-oakland', 'previews', `${observerDate.toString()}.jpg`)
    : undefined;
  const isPreviewShown = isImageSaved && supportsInlineImages(process.env, process.stdout.isTTY ?? false);

  // A post without its image is preferable over a no-post, so a failed image is
  // logged and only the text is posted. Dry runs render too, so the smoke test
  // exercises the image.
  let image: TimedPostImage | undefined;
  try {
    image = await createPostImage(phaseEvent, { imagePath, isPreviewShown, report });
  } catch (error) {
    console.error(pc.red('Image failed. Posting the text alone:'), error);
    report(); // Empty line break
  }
  const isDegraded = image === undefined;
  const postSummary = summarizePost(phaseEvent.type, graphemes, image);

  if (isDryRun) {
    report(pc.yellow('Dry run: skipping actual post.'));
    summary(`dry run: ${postSummary}`);
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
    report(pc.yellow('Already posted today: skipping.'));
    summary('already posted today');
    return isDegraded;
  }
  report(isDegraded ? pc.yellow('Posted without the image.') : pc.green('Posted successfully!'));
  report(`Account: @${env.bluesky.handle}`);
  report(`URI: ${result.uri}`);
  summary(`posted ${postSummary} → ${result.uri}`);
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

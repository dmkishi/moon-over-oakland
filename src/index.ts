import { Temporal } from '@js-temporal/polyfill';
import pc from 'picocolors';
import { config } from './config.ts';
import { location } from './constants.ts';
import { calculateMoonPost } from './moonPost.ts';
import { renderReport, renderPost } from './templates.ts';
import { createBlueskyClient } from './social/bluesky.ts';

/**
 * Parse optional date override from CLI args. Passing a date forces dry run.
 */
function parseArgs(): { date: Date; isDryRun: boolean } {
  const dateArg = process.argv[2];
  const date = dateArg
    ? new Date(Temporal.PlainDate.from(dateArg).toZonedDateTime(location.timezone).epochMilliseconds)
    : new Date();
  if (isNaN(date.getTime())) {
    console.error(pc.red(`Invalid date: "${dateArg}"`));
    process.exit(1);
  }
  const isDryRun = process.env.DRY_RUN === 'true' || !!dateArg;
  return { date, isDryRun };
}

async function main(): Promise<void> {
  const { date, isDryRun } = parseArgs();
  const moonPost = calculateMoonPost(
    date,
    location.timezone,
    location.latitude,
    location.longitude,
  );

  console.log('Moon Over Oakland');
  console.log('================================================================================');
  console.log(await renderReport(moonPost, location.timezone));
  console.log();

  if (!moonPost.doPost) {
    console.log(pc.red('Nothing to post.'));
    console.log();
    return;
  }

  const content = await renderPost(moonPost, location.timezone);
  console.log('Content of post:');
  console.log('--------------------------------------------------------------------------------');
  console.log(content);
  console.log('--------------------------------------------------------------------------------');
  console.log();

  if (isDryRun) {
    console.log(pc.yellow('Dry run: skipping actual post.'));
    return;
  }

  console.log('Posting to Bluesky...');
  try {
    const client = await createBlueskyClient(
      config.bluesky.handle,
      config.bluesky.appPassword
    );
    const result = await client.post(content);
    console.log(pc.green('Posted successfully!'));
    console.log(`URI: ${result.uri}`);
  } catch (error) {
    console.error(pc.red('Failed to post:'), error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(pc.red('Fatal error:'), error);
  process.exit(1);
});

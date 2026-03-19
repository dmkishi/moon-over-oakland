import { Temporal } from '@js-temporal/polyfill';
import pc from 'picocolors';
import { config } from './config.js';
import { location } from './constants.js';
import { calculateMoonDay } from './moonDay.js';
import { evaluatePostingRule } from './postingRule.js';
import { renderReport, renderPost } from './templates.js';
import { createBlueskyClient } from './social/bluesky.js';

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
  const args = [
    date,
    location.timezone,
    location.latitude,
    location.longitude,
  ] as const;

  const moonDay = calculateMoonDay(...args);
  console.log('Moon Over Oakland');
  console.log('================================================================================');
  console.log(await renderReport(moonDay, location.timezone));
  console.log();

  const decision = evaluatePostingRule(...args);
  if (!decision.doPost) {
    console.log(pc.red('Nothing to post.'));
    console.log();
    return;
  }

  const content = await renderPost(moonDay, location.timezone, decision.phase!);
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

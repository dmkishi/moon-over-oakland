import pc from 'picocolors';
import { config } from './config.js';
import { location } from './constants.js';
import { calculateMoonData, type MoonPhase } from './moon.js';
import { renderDataReport, renderPost } from './templates.js';
import { createBlueskyClient } from './social/bluesky.js';

const PHASES_TO_POST: MoonPhase[] = [
  'new',
  'first-quarter',
  'full',
  'third-quarter',
] as const;

async function main(): Promise<void> {
  const isDryRun = process.env.DRY_RUN === 'true';
  const now = new Date();
  const moonData = calculateMoonData(
    now,
    location.timezone,
    location.latitude,
    location.longitude,
  );

  console.log('Moon Over Oakland');
  console.log('================================================================================');
  console.log(await renderDataReport(moonData, location.timezone, now));
  console.log();

  if (!PHASES_TO_POST.includes(moonData.phaseName)) {
    console.log(pc.red('Nothing to post.'), `Phase "${moonData.phaseName}" is not a posting phase.`);
    console.log();
    return;
  }

  const content = await renderPost(moonData, location.timezone);
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

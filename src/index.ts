import pc from 'picocolors';
import { config } from './config.js';
import { location } from './constants.js';
import { calculateMoonData, type MoonPhase } from './moon.js';
import { renderTemplate } from './post.js';
import { createBlueskyClient } from './social/bluesky.js';

const PHASES_TO_POST: MoonPhase[] = [
  'new',
  'full',
  'first-quarter',
  'third-quarter',
];

async function main(): Promise<void> {
  const isDryRun = process.env.DRY_RUN === 'true';

  console.log('Moon Over Oakland');
  console.log('=================');

  const now = new Date();
  const moonData = calculateMoonData(
    now,
    location.timezone,
    location.latitude,
    location.longitude
  );

  const localeOptions = ['en-US', { timeZone: 'America/Los_Angeles' }] as const;
  console.log(`Date:           ${now.toLocaleDateString(...localeOptions)}`);
  console.log(`Phase:          ${moonData.phase}`);
  console.log(`Illumination:   ${moonData.illumination}%`);
  console.log(`Age:            ${moonData.age} days`);
  console.log(`Distance:       ${moonData.distance.toLocaleString()} km`);
  if (moonData.moonrise) {
    console.log(`Moonrise:       ${moonData.moonrise.toLocaleTimeString(...localeOptions)}`);
  }
  if (moonData.moonset) {
    console.log(`Moonset:        ${moonData.moonset.toLocaleTimeString(...localeOptions)}`);
  }
  console.log(`Next New Moon:  ${moonData.nextNewMoon.toLocaleDateString(...localeOptions)}`);
  console.log(`Next Full Moon: ${moonData.nextFullMoon.toLocaleDateString(...localeOptions)}`);
  console.log();

  if (!PHASES_TO_POST.includes(moonData.phase)) {
    console.log(pc.red('Skipping post.'), `Phase "${moonData.phase}" is not a posting phase.`);
    console.log();
    return;
  }

  const content = await renderTemplate(moonData, location.timezone);
  console.log('Post content:');
  console.log('-'.repeat(80));
  console.log(content);
  console.log('-'.repeat(80));
  console.log();

  if (isDryRun) {
    console.log(pc.yellow('Dry run mode: skipping actual post.'));
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

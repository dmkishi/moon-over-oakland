import { config } from './config.js';
import { location } from './constants.js';
import { calculateMoonData, type MoonPhase } from './moon.js';
import { renderTemplate } from './template.js';
import { createBlueskyClient } from './social/bluesky.js';

// Phases that trigger a post
const PHASES_TO_POST: MoonPhase[] = ['new', 'full', 'first-quarter', 'third-quarter'];

async function main(): Promise<void> {
  const isDryRun = process.env.DRY_RUN === 'true';

  console.log('🌙 Moon Over Oakland');
  console.log('====================\n');

  // Calculate moon data for today
  const now = new Date();
  const moonData = calculateMoonData(
    now,
    location.timezone,
    location.latitude,
    location.longitude
  );

  console.log(`📅 Date: ${now.toLocaleDateString('en-US', { timeZone: location.timezone })}`);
  console.log(`🌙 Phase: ${moonData.phase}`);
  console.log(`💡 Illumination: ${moonData.illumination}%`);
  console.log(`📆 Age: ${moonData.age} days`);
  console.log(`📏 Distance: ${moonData.distance.toLocaleString()} km`);
  if (moonData.moonrise) {
    console.log(`🌅 Moonrise: ${moonData.moonrise.toLocaleTimeString('en-US', { timeZone: location.timezone })}`);
  }
  if (moonData.moonset) {
    console.log(`🌇 Moonset: ${moonData.moonset.toLocaleTimeString('en-US', { timeZone: location.timezone })}`);
  }
  console.log();

  // Check if we should post today
  if (!PHASES_TO_POST.includes(moonData.phase)) {
    console.log(`📭 Phase "${moonData.phase}" is not a posting phase. Skipping.`);
    console.log(`   Posting phases: ${PHASES_TO_POST.join(', ')}`);
    return;
  }

  console.log(`✅ Phase "${moonData.phase}" is a posting phase!\n`);

  // Render the template
  const content = await renderTemplate(moonData, location.timezone);

  console.log('📝 Post content:');
  console.log('─'.repeat(40));
  console.log(content);
  console.log('─'.repeat(40));
  console.log();

  if (isDryRun) {
    console.log('🏃 Dry run mode — skipping actual post.');
    return;
  }

  // Post to Bluesky
  console.log('📤 Posting to Bluesky...');

  try {
    const client = await createBlueskyClient(
      config.bluesky.handle,
      config.bluesky.appPassword
    );

    const result = await client.post(content);
    console.log(`✅ Posted successfully!`);
    console.log(`   URI: ${result.uri}`);
  } catch (error) {
    console.error('❌ Failed to post:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

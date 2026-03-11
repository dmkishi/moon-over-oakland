import pc from 'picocolors';
import { config } from './config.js';
import { location } from './constants.js';
import { calculateMoonData, type MoonPhase } from './moon.js';
import { renderTemplate } from './post.js';
import { createBlueskyClient } from './social/bluesky.js';

const PHASES_TO_POST: MoonPhase[] = [
  'new',
  'first-quarter',
  'full',
  'third-quarter',
];

function daysAway(date: Date): number {
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const todayStart = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((targetStart - todayStart) / msPerDay);
}

async function main(): Promise<void> {
  const isDryRun = process.env.DRY_RUN === 'true';
  const now = new Date();
  const moonData = calculateMoonData(
    now,
    location.timezone,
    location.latitude,
    location.longitude,
  );

  const oaklandDateTime = new Intl.DateTimeFormat('en-US', {
    timeZone: location.timezone,
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const oaklandDate = new Intl.DateTimeFormat('en-US', {
    timeZone: location.timezone,
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });

  console.log('Moon Over Oakland');
  console.log('================================================================================');
  console.log(`Calculated At:  ${oaklandDateTime.format(now)}`);
  console.log(`Phase Name:     ${moonData.phaseName}`);
  console.log(`Phase:          ${moonData.phase}`);
  console.log(`Illumination:   ${Math.round(moonData.illumination * 100)}%`);
  console.log(`Age:            ${moonData.age} days`);
  console.log(`Distance:       ${moonData.distanceKm.toLocaleString()} km`);

  const moonriseTime = oaklandDateTime.format(moonData.moonrise.date);
  const moonriseCompassDirection = moonData.moonrise.compassDirection;
  const moonriseCompassDeg = Math.round(moonData.moonrise.compassDeg);
  const moonriseTiltDeg = Math.round(moonData.moonrise.tiltDeg);
  console.log(`Moonrise:       ${moonriseTime} (${moonriseCompassDirection}, ${moonriseCompassDeg}°, Tilt: ${moonriseTiltDeg}°)`);

  const moonsetTime = oaklandDateTime.format(moonData.moonset.date);
  const moonsetCompassDirection = moonData.moonset.compassDirection;
  const moonsetCompassDeg = Math.round(moonData.moonset.compassDeg);
  const moonsetTiltDeg = Math.round(moonData.moonset.tiltDeg);
  console.log(`Moonset:        ${moonsetTime} (${moonsetCompassDirection}, ${moonsetCompassDeg}°, Tilt: ${moonsetTiltDeg}°)`);

  const sunriseTime = oaklandDateTime.format(moonData.sunrise.date);
  const sunriseCompassDirection = moonData.sunrise.compassDirection;
  const sunriseCompassDeg = Math.round(moonData.sunrise.compassDeg);
  console.log(`Sunrise:        ${sunriseTime} (${sunriseCompassDirection}, ${sunriseCompassDeg}°)`);

  const sunsetTime = oaklandDateTime.format(moonData.sunset.date);
  const sunsetCompassDirection = moonData.sunset.compassDirection;
  const sunsetCompassDeg = Math.round(moonData.sunset.compassDeg);
  console.log(`Sunset:         ${sunsetTime} (${sunsetCompassDirection}, ${sunsetCompassDeg}°)`);

  const nextNewMoonDaysAway = daysAway(moonData.nextNewMoon);
  const nextNewMoonDate = oaklandDate.format(moonData.nextNewMoon);
  console.log(`Next New Moon:  ${nextNewMoonDaysAway} days (${nextNewMoonDate})`);

  const nextFullMoonDaysAway = daysAway(moonData.nextFullMoon);
  const nextFullMoonDate = oaklandDate.format(moonData.nextFullMoon);
  console.log(`Next Full Moon: ${nextFullMoonDaysAway} days (${nextFullMoonDate})`);

  console.log();

  if (!PHASES_TO_POST.includes(moonData.phaseName)) {
    console.log(pc.red('Nothing to post.'), `Phase "${moonData.phaseName}" is not a posting phase.`);
    console.log();
    return;
  }

  const content = await renderTemplate(moonData, location.timezone);
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

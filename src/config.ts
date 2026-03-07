import { z } from 'zod';
import 'dotenv/config';

const configSchema = z.object({
  bluesky: z.object({
    handle: z.string().min(1, 'BLUESKY_HANDLE is required'),
    appPassword: z.string().min(1, 'BLUESKY_APP_PASSWORD is required'),
  }),
  location: z.object({
    timezone: z.string().min(1).default('America/Los_Angeles'),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const result = configSchema.safeParse({
    bluesky: {
      handle: process.env.BLUESKY_HANDLE,
      appPassword: process.env.BLUESKY_APP_PASSWORD,
    },
    location: {
      timezone: process.env.TIMEZONE || 'America/Los_Angeles',
      latitude: parseFloat(process.env.LATITUDE || '37.8044'),
      longitude: parseFloat(process.env.LONGITUDE || '-122.2712'),
    },
  });

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Configuration error:\n${errors}`);
  }

  // Validate timezone is valid
  try {
    Intl.DateTimeFormat(undefined, { timeZone: result.data.location.timezone });
  } catch {
    throw new Error(`Invalid timezone: ${result.data.location.timezone}`);
  }

  return result.data;
}

export const config = loadConfig();

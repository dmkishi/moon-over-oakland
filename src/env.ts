import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  bluesky: z.object({
    handle: z.string().min(1, 'BLUESKY_HANDLE is required'),
    appPassword: z.string().min(1, 'BLUESKY_APP_PASSWORD is required'),
  }),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse({
    bluesky: {
      handle: process.env.BLUESKY_HANDLE,
      appPassword: process.env.BLUESKY_APP_PASSWORD,
    },
  });

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Configuration error:\n${errors}`);
  }

  return result.data;
}

export const env = loadEnv();

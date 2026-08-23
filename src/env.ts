/**
 * Configuration read from the environment, validated once at import.
 *
 * The schema is the only place environment variables are named, and a missing
 * or malformed one throws here rather than surfacing as an undefined credential
 * deep in a Bluesky call.
 */
import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  bluesky: z.object({
    handle: z.string().min(1, 'BLUESKY_HANDLE is required'),
    appPassword: z.string().min(1, 'BLUESKY_APP_PASSWORD is required'),
  }),

  /**
   * Parsed from the literal strings `"true"` and `"false"` rather than coerced:
   * `z.coerce.boolean()` is `Boolean(value)`, which would read `"false"` as
   * true.
   */
  dryRun: z
    .enum(['true', 'false'], {
      errorMap: () => ({ message: 'DRY_RUN must be "true" or "false"' }),
    })
    .optional()
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse({
    bluesky: {
      handle: process.env.BLUESKY_HANDLE,
      appPassword: process.env.BLUESKY_APP_PASSWORD,
    },
    dryRun: process.env.DRY_RUN || undefined,
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

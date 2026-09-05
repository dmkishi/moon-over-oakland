/**
 * Shape the configuration is read from: `process.env`, or a Worker binding.
 */
type EnvSource = Record<string, string | undefined>;

export interface Env {
  bluesky: {
    handle: string;
    appPassword: string;
  };
}

/**
 * @pure
 */
export function loadEnv(source: EnvSource): Env {
  const handle = source.BLUESKY_HANDLE;
  const appPassword = source.BLUESKY_APP_PASSWORD;

  const hasHandle = handle !== undefined && handle !== '';
  const hasAppPassword = appPassword !== undefined && appPassword !== '';

  if (!hasHandle || !hasAppPassword) {
    const errors: string[] = [];
    if (!hasHandle) errors.push('  - BLUESKY_HANDLE is required');
    if (!hasAppPassword) errors.push('  - BLUESKY_APP_PASSWORD is required');
    throw new Error(`Configuration error:\n${errors.join('\n')}`);
  }

  return {
    bluesky: {
      handle,
      appPassword,
    },
  };
}

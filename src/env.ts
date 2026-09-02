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
  const handle = source['BLUESKY_HANDLE'];
  const appPassword = source['BLUESKY_APP_PASSWORD'];

  // An unset variable and an empty one are the same misconfiguration.
  if (!handle || !appPassword) {
    const errors = [
      ...(handle ? [] : ['BLUESKY_HANDLE']),
      ...(appPassword ? [] : ['BLUESKY_APP_PASSWORD']),
    ]
      .map((name) => `  - ${name} is required`)
      .join('\n');
    throw new Error(`Configuration error:\n${errors}`);
  }

  return {
    bluesky: {
      handle,
      appPassword,
    },
  };
}

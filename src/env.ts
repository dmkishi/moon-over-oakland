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

type Account = 'production' | 'test';

interface Keys {
  handle: string;
  appPassword: string;
}

const KEYS: Record<Account, Keys> = {
  production: {
    handle: 'BLUESKY_HANDLE',
    appPassword: 'BLUESKY_APP_PASSWORD',
  },
  test: {
    handle: 'TEST_BLUESKY_HANDLE',
    appPassword: 'TEST_BLUESKY_APP_PASSWORD',
  },
};

/**
 * Read account credentials. Never fallback from one account to another.
 *
 * @pure
 */
export function loadEnv(source: EnvSource, account: Account = 'production'): Env {
  const { handle: handleKey, appPassword: appPasswordKey } = KEYS[account];

  const handle = source[handleKey];
  const appPassword = source[appPasswordKey];

  const hasHandle = handle !== undefined && handle !== '';
  const hasAppPassword = appPassword !== undefined && appPassword !== '';

  if (!hasHandle || !hasAppPassword) {
    const errors: string[] = [];
    if (!hasHandle) errors.push(`  - ${handleKey} is required`);
    if (!hasAppPassword) errors.push(`  - ${appPasswordKey} is required`);
    throw new Error(`Configuration error:\n${errors.join('\n')}`);
  }

  return {
    bluesky: {
      handle,
      appPassword,
    },
  };
}

interface Monitor {
  start: () => Promise<void>;
  success: () => Promise<void>;
  fail: () => Promise<void>;
}

/**
 * Stands in when there is no switch to ping, so callers never branch.
 */
const INERT_MONITOR: Monitor = {
  start: () => Promise.resolve(),
  success: () => Promise.resolve(),
  fail: () => Promise.resolve(),
};

const PING_PATH = {
  START: '/start',
  SUCCESS: '',
  FAIL: '/fail',
} as const;

type PingPath = (typeof PING_PATH)[keyof typeof PING_PATH];

const TIMEOUT_MS = 10_000;

/**
 * POST to a dead man's switch at <healthchecks.io>.
 */
async function ping(baseUrl: string, path: PingPath): Promise<void> {
  try {
    await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      body: process.env.GIT_REVISION ?? '',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // NEVER THROW: a monitor that is down must not take the post down with it.
    console.error(`Monitor ping failed: ${String(error)}`);
  }
}

/**
 * The URL is a shared secret so must be passed: it belongs in `.env` and in
 * host secrets, never in the source or the image.
 *
 * An absent or empty URL yields an inert monitor whose pings are silent no-ops,
 * useful for dry runs or when an account at <healthchecks.io> is not configured.
 */
export function createMonitor(baseUrl: string | undefined): Monitor {
  if (baseUrl === undefined || baseUrl === '') return INERT_MONITOR;

  return {
    start: () => ping(baseUrl, PING_PATH.START),
    success: () => ping(baseUrl, PING_PATH.SUCCESS),
    fail: () => ping(baseUrl, PING_PATH.FAIL),
  };
}

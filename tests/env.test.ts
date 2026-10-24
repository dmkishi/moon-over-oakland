import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadEnv } from '../src/env.ts';

interface Credentials {
  handle: string;
  appPassword: string;
}

interface Fixture {
  name: string;
  account?: 'test';
  /** The variable each credential is read from */
  keys: Credentials;
  values: Credentials;
}

const production: Fixture = {
  name: 'production',
  keys: { handle: 'BLUESKY_HANDLE', appPassword: 'BLUESKY_APP_PASSWORD' },
  values: { handle: 'moon.example.com', appPassword: 'abcd-efgh-ijkl-mnop' },
};

const testAccount: Fixture = {
  name: 'test',
  account: 'test',
  keys: { handle: 'TEST_BLUESKY_HANDLE', appPassword: 'TEST_BLUESKY_APP_PASSWORD' },
  values: { handle: 'moon-test.example.com', appPassword: 'qrst-uvwx-yzab-cdef' },
};

/**
 * An account's credentials, keyed by variable name as an environment holds
 * them.
 */
function varsOf({ keys, values }: Fixture): Record<string, string> {
  return { [keys.handle]: values.handle, [keys.appPassword]: values.appPassword };
}

describe.each([
  { ...production, other: testAccount },
  { ...testAccount, other: production },
])('loadEnv for the $name account', (fixture) => {
  const { account, keys, values, other } = fixture;

  // The other account's variables stay set throughout: there is deliberately
  // no fallback, so they must never stand in for a missing one.
  const source = { ...varsOf(fixture), ...varsOf(other) };

  it('reads both credentials from the source', () => {
    expect(loadEnv(source, account)).toEqual({ bluesky: values });
  });

  // An empty variable is the shape a `.env` with `BLUESKY_HANDLE=` produces,
  // and it has to fail the same way an absent one does.
  it.each([keys.handle, keys.appPassword].flatMap((key) => [
    { key, state: 'absent', value: undefined },
    { key, state: 'empty', value: '' },
  ]))('names $key when it is $state', ({ key, value }) => {
    expect(() => loadEnv({ ...source, [key]: value }, account))
      .toThrow(`  - ${key} is required`);
  });

  // A first run has neither set. Reporting one at a time would mean two runs
  // to learn what to configure.
  it('reports both in one error', () => {
    expect(() => loadEnv(varsOf(other), account)).toThrow(
      `Configuration error:\n  - ${keys.handle} is required\n  - ${keys.appPassword} is required`,
    );
  });
});

describe('loadEnv', () => {
  it('ignores keys it was not asked for', () => {
    expect(loadEnv({ ...varsOf(production), TIMEZONE: 'Asia/Tokyo' })).toEqual({
      bluesky: production.values,
    });
  });
});

// `loadEnv` reads only the source it is handed, so a variable left set on the
// host, or stubbed by another test, can't stand in for one the source lacks.
describe('loadEnv and the ambient environment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not fall back to it', () => {
    vi.stubEnv(production.keys.handle, production.values.handle);
    vi.stubEnv(production.keys.appPassword, production.values.appPassword);

    expect(() => loadEnv({})).toThrow('Configuration error:');
  });

  it('prefers the source over it', () => {
    vi.stubEnv(production.keys.handle, 'ambient.example.com');

    expect(loadEnv(varsOf(production)).bluesky.handle).toBe(production.values.handle);
  });
});

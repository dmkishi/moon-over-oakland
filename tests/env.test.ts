import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadEnv } from '../src/env.ts';

interface Fixture {
  name: string;
  account?: 'test';
  handleKey: string;
  handle: string;
  appPasswordKey: string;
  appPassword: string;
}

const withVars = (fixture: Fixture) => ({
  ...fixture,
  vars: {
    [fixture.handleKey]: fixture.handle,
    [fixture.appPasswordKey]: fixture.appPassword,
  },
});

const production = withVars({
  name: 'production',
  handleKey: 'BLUESKY_HANDLE',
  handle: 'moon.example.com',
  appPasswordKey: 'BLUESKY_APP_PASSWORD',
  appPassword: 'abcd-efgh-ijkl-mnop',
});

const testAccount = withVars({
  name: 'test',
  account: 'test',
  handleKey: 'TEST_BLUESKY_HANDLE',
  handle: 'moon-test.example.com',
  appPasswordKey: 'TEST_BLUESKY_APP_PASSWORD',
  appPassword: 'qrst-uvwx-yzab-cdef',
});

const accounts = [
  { ...production, otherVars: testAccount.vars },
  { ...testAccount, otherVars: production.vars },
];

describe.each(accounts)(
  'loadEnv for the $name account',
  ({ account, handleKey, handle, appPasswordKey, appPassword, vars, otherVars }) => {
    // The other account's variables stay set throughout: there is deliberately
    // no fallback, so they must never stand in for a missing one.
    const source = { ...vars, ...otherVars };

    it('reads both credentials from the source', () => {
      expect(loadEnv(source, account)).toEqual({ bluesky: { handle, appPassword } });
    });

    // An empty variable is the shape a `.env` with `BLUESKY_HANDLE=` produces,
    // and it has to fail the same way an absent one does.
    it.each([handleKey, appPasswordKey].flatMap((key) => [
      { key, state: 'absent', value: undefined },
      { key, state: 'empty', value: '' },
    ]))('names $key when it is $state', ({ key, value }) => {
      expect(() => loadEnv({ ...source, [key]: value }, account))
        .toThrow(`  - ${key} is required`);
    });

    // A first run has neither set. Reporting one at a time would mean two runs
    // to learn what to configure.
    it('reports both in one error', () => {
      expect(() => loadEnv(otherVars, account)).toThrow(
        `Configuration error:\n  - ${handleKey} is required\n  - ${appPasswordKey} is required`,
      );
    });
  },
);

describe('loadEnv', () => {
  it('ignores keys it was not asked for', () => {
    expect(loadEnv({ ...production.vars, TIMEZONE: 'Asia/Tokyo' })).toEqual({
      bluesky: { handle: production.handle, appPassword: production.appPassword },
    });
  });
});

// The Worker has no `process.env` and passes its bindings instead, so reading
// the ambient environment would work in the CLI and fail only in production.
describe('loadEnv and the ambient environment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not fall back to it', () => {
    vi.stubEnv(production.handleKey, production.handle);
    vi.stubEnv(production.appPasswordKey, production.appPassword);

    expect(() => loadEnv({})).toThrow('Configuration error:');
  });

  it('prefers the source over it', () => {
    vi.stubEnv(production.handleKey, 'ambient.example.com');

    expect(loadEnv(production.vars).bluesky.handle).toBe('moon.example.com');
  });
});

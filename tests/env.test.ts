import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadEnv } from '../src/env.ts';

const valid = {
  BLUESKY_HANDLE: 'moon.example.com',
  BLUESKY_APP_PASSWORD: 'abcd-efgh-ijkl-mnop',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('loadEnv', () => {
  it('reads both credentials from the source', () => {
    expect(loadEnv(valid)).toEqual({
      bluesky: {
        handle: 'moon.example.com',
        appPassword: 'abcd-efgh-ijkl-mnop',
      },
    });
  });

  it('ignores keys it was not asked for', () => {
    expect(loadEnv({ ...valid, TIMEZONE: 'Asia/Tokyo' }).bluesky.handle)
      .toBe('moon.example.com');
  });

  it.each<keyof typeof valid>([
    'BLUESKY_HANDLE',
    'BLUESKY_APP_PASSWORD',
  ])('names %s when it is absent', (name) => {
    const source = { ...valid };
    delete source[name];

    expect(() => loadEnv(source)).toThrow(`  - ${name} is required`);
  });

  // An empty variable is the shape a `.env` with `BLUESKY_HANDLE=` produces,
  // and it has to fail the same way an absent one does.
  it.each([
    ['BLUESKY_HANDLE'],
    ['BLUESKY_APP_PASSWORD'],
  ])('names %s when it is empty', (name) => {
    expect(() => loadEnv({ ...valid, [name]: '' })).toThrow(`  - ${name} is required`);
  });

  // A first run has neither set. Reporting one at a time would mean two runs to
  // learn what to configure.
  it('reports both in one error', () => {
    expect(() => loadEnv({})).toThrow(
      'Configuration error:\n  - BLUESKY_HANDLE is required\n  - BLUESKY_APP_PASSWORD is required',
    );
  });

  // The Worker has no `process.env` and passes its bindings instead, so reading
  // the ambient environment would work in the CLI and fail only in production.
  it('does not fall back to the ambient environment', () => {
    vi.stubEnv('BLUESKY_HANDLE', valid.BLUESKY_HANDLE);
    vi.stubEnv('BLUESKY_APP_PASSWORD', valid.BLUESKY_APP_PASSWORD);

    expect(() => loadEnv({})).toThrow('Configuration error:');
  });

  it('prefers the source over the ambient environment', () => {
    vi.stubEnv('BLUESKY_HANDLE', 'ambient.example.com');

    expect(loadEnv(valid).bluesky.handle).toBe('moon.example.com');
  });
});

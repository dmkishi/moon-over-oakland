import { configDefaults, coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  /**
   * The test suite runs twice, under the local timezone and under UTC, because
   * most of what it asserts is timezone dependent.
   */
  test: {
    setupFiles: ['./tests/support/matchers.ts'],

    /**
     * Undo every spy and stubbed global before each test. Not `unstubEnvs`,
     * which would also undo a `vi.stubEnv` made in `beforeAll`.
     */
    restoreMocks: true,
    unstubGlobals: true,

    projects: [
      {
        test: {
          name: 'local',
        },
      },
      {
        test: {
          name: 'utc',
          env: { TZ: 'UTC' },

          /**
           * Files that don't depend on the host's timezone run once. Opt out
           * here rather than in, so that a new test runs under UTC too.
           * `post.test.ts` forces its own zone, and the Horizons tests pin
           * every instant to the site's zone or UT.
           */
          exclude: [
            ...configDefaults.exclude,
            'tests/args.test.ts',
            'tests/env.test.ts',
            'tests/post.test.ts',
            'tests/nasaJplHorizons/**',
          ],
        },
      },
    ],

    /**
     * No thresholds yet: the suite does not cover enough to set one that is
     * both honest and passing.
     */
    coverage: {
      include: ['src/**/*.ts', 'scripts/**/*.ts'],
      exclude: [...coverageConfigDefaults.exclude, '**/*.d.ts'],
      reporter: ['text', 'html'],
    },
  },
});

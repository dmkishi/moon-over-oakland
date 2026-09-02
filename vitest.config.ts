import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  /**
   * The test suite runs twice, under the local timezone and under UTC, because
   * most of what it asserts is timezone dependent.
   */
  test: {
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
        },
      },
    ],

    /**
     * No thresholds yet: the suite does not cover enough to set one that is
     * both honest and passing.
     */
    coverage: {
      include: ['src/**/*.ts'],
      exclude: [...coverageConfigDefaults.exclude, '**/*.d.ts'],
      reporter: ['text', 'html'],
    },
  },
});

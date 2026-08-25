/**
 * Verifies that `phaseEventInstant()` reproduces the JPL Horizons instants of
 * the principal lunar phases, and that `lunationIndex()` lands close enough to
 * find them.
 *
 * This asserts the chapter 49 core directly rather than through
 * `evaluatePosting()` and `assignPostingDate()`, so a failure here localizes to
 * the formula. The posting rules built on top of it are covered by
 * `moonPost.posting.test.ts`.
 *
 * Reference data at `./fixtures/meeus49.jsonc`.
 */
import { describe, it, expect } from 'vitest';
import { lunationIndex, phaseEventInstant, type Phase } from '../src-original/meeus49.ts';
import { loadFixture } from './loadFixture.ts';

/**
 * Chapter 49 agrees with Horizons to within 10 s everywhere the fixtures reach,
 * so a minute is ~6x margin. Resist loosening it: the defect this module
 * replaced had a 99-minute median and survived review under a 15-minute
 * rise/set tolerance.
 */
const TOLERANCE_MINUTES = 1;

/**
 * Past ~2060 both halves of the conversion are extrapolations — ΔT of Earth's
 * rotation, and the truncated series itself. Measured against Horizons at 2100
 * the miss runs 48 s to 215 s, and which half dominates is not established.
 * Held to five minutes to pin the order of magnitude, not the value: a
 * regression that breaks a coefficient still shows up here as hours.
 */
const FAR_FUTURE_TOLERANCE_MINUTES = 5;

interface Fixture {
  description: string;
  k: number;
  phase: Phase;
  dateTime: string;
}

const fixtures = loadFixture<Fixture[]>(
  new URL('./fixtures/meeus49.jsonc', import.meta.url)
);

/**
 * Horizons instants for the four principal phases of 2100, where T ≈ 1 and every
 * T-power term in the series is at full strength. Inline rather than in the
 * fixture file because they carry their own tolerance.
 */
const FAR_FUTURE: Fixture[] = [
  { description: '2100: New moon',      k: 1237, phase: 'new',           dateTime: '2100-01-10T04:57:46-08:00' },
  { description: '2100: First quarter', k: 1237, phase: 'first-quarter', dateTime: '2100-01-18T04:35:49-08:00' },
  { description: '2100: Full moon',     k: 1237, phase: 'full',          dateTime: '2100-01-25T18:51:42-08:00' },
  { description: '2100: Last quarter',  k: 1237, phase: 'last-quarter',  dateTime: '2100-02-01T13:18:02-08:00' },
];

function minutesBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60_000;
}

function expectInstantWithin(fixture: Fixture, tolerance: number): void {
  const expected = new Date(fixture.dateTime);
  const actual = phaseEventInstant(fixture.k, fixture.phase);
  const diff = minutesBetween(actual, expected);

  if (diff > tolerance) {
    const error = new Error(
      `expected ${expected.toISOString()}, got ${actual.toISOString()} ` +
      `(Δ ${diff.toFixed(2)} min)`
    );
    error.name = 'AssertionError';
    throw error;
  }
}

describe(`phaseEventInstant() is within ±${TOLERANCE_MINUTES} minute of Horizons`, () => {
  for (const fixture of fixtures) {
    it(fixture.description, () => {
      expectInstantWithin(fixture, TOLERANCE_MINUTES);
    });
  }
});

describe(`phaseEventInstant() is within ±${FAR_FUTURE_TOLERANCE_MINUTES} minutes at T ≈ 1`, () => {
  for (const fixture of FAR_FUTURE) {
    it(fixture.description, () => {
      expectInstantWithin(fixture, FAR_FUTURE_TOLERANCE_MINUTES);
    });
  }
});

describe('lunationIndex() brackets the event it is asked about', () => {
  // The posting code trusts that evaluating k-1, k, and k+1 reaches any nearby
  // event. That only holds if lunationIndex() is within one of the true index.
  for (const fixture of [...fixtures, ...FAR_FUTURE]) {
    it(fixture.description, () => {
      const k = lunationIndex(new Date(fixture.dateTime));
      expect(Math.abs(k - fixture.k)).toBeLessThanOrEqual(1);
    });
  }
});

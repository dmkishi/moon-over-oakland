/**
 * Tolerance matchers, registered for every test file through `setupFiles` in
 * `vitest.config.ts`.
 *
 * `expect(Math.abs(a - b)).toBeLessThan(tolerance)` fails with the gap alone.
 * These print both values as well.
 */
import { expect } from 'vitest';
import { angleDiff } from './angle.ts';

type Tolerance = { minutes: number } | { seconds: number };

declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    /**
     * The received `Temporal.ZonedDateTime` lies within `tolerance` of the ISO
     * date-time `expected`, which carries its own offset.
     */
    toBeWithin: (expected: string, tolerance: Tolerance) => R;

    /**
     * The received angle lies within `degrees` of `expected`, the short way
     * round.
     */
    toBeWithinAngle: (expected: number, degrees: number) => R;

    /**
     * The received number lies within `tolerance` of `expected`.
     */
    toBeNear: (expected: number, tolerance: number) => R;
  }
}

/**
 * A gap to three significant figures.
 * @pure
 */
function round(gap: number): number {
  return Number(gap.toPrecision(3));
}

expect.extend({
  toBeWithin(received: unknown, expected: string, tolerance: Tolerance) {
    if (!(received instanceof Temporal.ZonedDateTime)) {
      throw new TypeError(`toBeWithin expects a Temporal.ZonedDateTime, got ${this.utils.stringify(received)}`);
    }
    const [unit, limit] = 'minutes' in tolerance
      ? ['minutes', tolerance.minutes] as const
      : ['seconds', tolerance.seconds] as const;
    const gap = Math.abs(received.toInstant().until(Temporal.Instant.from(expected)).total(unit));
    return {
      pass: gap <= limit,
      message: () => `expected ${this.utils.printReceived(received.toString())} ${this.isNot ? 'not ' : ''}`
        + `to be within ${limit} ${unit} of ${this.utils.printExpected(expected)}, `
        + `and it is ${round(gap)} ${unit} off`,
    };
  },

  toBeWithinAngle(received: number, expected: number, degrees: number) {
    const gap = Math.abs(angleDiff(received, expected));
    return {
      pass: gap <= degrees,
      message: () => `expected ${this.utils.printReceived(received)}° ${this.isNot ? 'not ' : ''}`
        + `to be within ${degrees}° of ${this.utils.printExpected(expected)}°, `
        + `and it is ${round(gap)}° off`,
    };
  },

  toBeNear(received: number, expected: number, tolerance: number) {
    const gap = Math.abs(received - expected);
    return {
      pass: gap <= tolerance,
      message: () => `expected ${this.utils.printReceived(received)} ${this.isNot ? 'not ' : ''}`
        + `to be within ${tolerance} of ${this.utils.printExpected(expected)}, `
        + `and it is ${round(gap)} off`,
    };
  },
});

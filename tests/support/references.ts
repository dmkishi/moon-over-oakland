import type { PhaseType } from '../../src/ephemeris/phase.ts';
import type { MoonEvent } from '../../src/event-delta.ts';

/**
 * What each phase reads its moonrise and moonset against. A copy of
 * `REFERENCES` in `src/event-delta.ts` so they cannot drift together.
 */
export const REFERENCES: Record<PhaseType, Record<MoonEvent, string>> = {
  'new': {
    moonrise: 'sunrise',
    moonset: 'sunset',
  },
  'first-quarter': {
    moonrise: 'noon',
    moonset: 'midnight',
  },
  'full': {
    moonrise: 'sunset',
    moonset: 'sunrise',
  },
  'last-quarter': {
    moonrise: 'midnight',
    moonset: 'noon',
  },
};

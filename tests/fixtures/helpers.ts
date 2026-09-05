/**
 * Loads the JSONC fixtures and asserts their shape once, at import time, so a
 * bad paste fails at collection rather than vanishing into a skipped assertion.
 *
 * The fixtures stay comment-annotated data files; the schemas are the only
 * place their shape is spelled out. `phaseType` derives from `PHASE_TYPES`, so
 * the valid phase names are stated once in the repo, in `src/`.
 *
 * Schemas are strict: `pnpm horizons` prints a superset of what these files
 * keep, so an untrimmed paste is rejected by name rather than ignored.
 */
import { readFileSync } from 'node:fs';
import stripJsonComments from 'strip-json-comments';
import { z } from 'zod';
import { PHASE_TYPES } from '../../src/ephemeris/phase.ts';

/**
 * Offsets are required. A naked instant is a valid ISO string that the fixture
 * generator never emits, and reading one back reinterprets it in local time.
 */
const dateTime = z.iso.datetime({ offset: true });
const day = z.iso.date();

const event = z.object({ dateTime }).strict();

/** Not nullable: in Oakland, the sun always rises and sets. */
const sunEvent = event;

/** Null when the paired event falls outside the civil day. */
const moonEvent = event.nullable();

const accuracyFixture = z.object({
  description: z.string().optional(),
  day,
  events: z.object({
    moonrise: moonEvent,
    moonset: moonEvent,
    sunrise: sunEvent,
    sunset: sunEvent,
  }).strict(),
}).strict();

const postingFixture = z.object({
  eventDate: day,
  phaseType: z.enum(PHASE_TYPES),
  post: z.enum(['same', 'prev']),
  dateTime,
}).strict();

export type AccuracyFixture = z.infer<typeof accuracyFixture>;
export type PostingFixture = z.infer<typeof postingFixture>;

function load<S extends z.ZodType>(name: string, schema: S): z.infer<S> {
  const raw = readFileSync(new URL(name, import.meta.url), 'utf8');
  return schema.parse(JSON.parse(stripJsonComments(raw)));
}

export const accuracyFixtures = load(
  './day-events.accuracy.jsonc',
  z.array(accuracyFixture).min(1),
);

/** 12 new, 12 first quarter, 13 full, 13 last quarter. */
const PHASES_IN_2026 = 50;

// The posting fixture is exhaustive by definition, so a truncated paste is a
// bug rather than a shorter run.
export const postingFixtures = load(
  './phase-event.posting.jsonc',
  z.array(postingFixture).length(PHASES_IN_2026),
);

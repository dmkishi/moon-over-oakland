/**
 * Verifies `calculatePhaseEvent()`'s posting decisions against every principal
 * phase of 2026.
 *
 * Posting rules at `./fixtures/phase-event.posting.jsonc`, transcribed from
 * `docs/posting-algorithm.md`.
 */
import { describe, it, expect } from 'vitest';
import { Temporal } from '@js-temporal/polyfill';
import { calculatePhaseEvent, type PhaseEvent } from '../src/phase-event.ts';
import { observer } from '../src/observer.ts';
import { loadFixture } from './loadFixture.ts';

interface PostingFixture {
  eventDate: string;
  phaseType: PhaseEvent['type'];
  post: 'same' | 'prev';
}

const { timezone, latitude, longitude } = observer;

function calculate(date: Temporal.PlainDate): PhaseEvent | null {
  return calculatePhaseEvent(date, timezone, latitude, longitude);
}

const postingFixtures = loadFixture<PostingFixture[]>(
  new URL('./fixtures/phase-event.posting.jsonc', import.meta.url)
);

for (const fixture of postingFixtures) {
  const eventDate = Temporal.PlainDate.from(fixture.eventDate);
  const postDate = fixture.post === 'prev' ? eventDate.subtract({ days: 1 }) : eventDate;

  describe(`${fixture.phaseType} on ${fixture.eventDate} (${fixture.post})`, () => {
    it(`posts on ${postDate}`, () => {
      const result = calculate(postDate);
      expect(result).not.toBeNull();
      expect(result!.type).toBe(fixture.phaseType);
      expect(result!.day).toBe(fixture.post === 'same' ? 'today' : 'tomorrow');
      expect(result!.time.toPlainDate().equals(eventDate)).toBe(true);
    });

    it('does not count its own phase as next', () => {
      const result = calculate(postDate)!;
      const nextOfSameType = result.nextPhases[fixture.phaseType];
      expect(Temporal.ZonedDateTime.compare(nextOfSameType, result.time)).toBe(1);
    });

    it('does not post on adjacent days', () => {
      expect(calculate(postDate.subtract({ days: 1 }))).toBeNull();
      expect(calculate(postDate.add({ days: 1 }))).toBeNull();
    });
  });
}

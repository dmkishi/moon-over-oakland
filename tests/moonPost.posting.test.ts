/**
 * Ensures that calculateMoonPost() correctly identifies the appropriate posting
 * date for each major moon phase, and does not trigger on non-posting dates.
 */
import { describe, it, expect } from 'vitest';
import { Temporal } from '@js-temporal/polyfill';
import { calculateMoonPost } from '../src-original/moonPost.ts';
import { observer } from '../src-original/observer.ts';
import { loadFixture } from './loadFixture.ts';

type PostDay = 'same' | 'next' | 'prev';

interface Fixture {
  eventDate: string;
  postDay: PostDay;
  phase: string;
}

const fixtures = loadFixture<Fixture[]>(
  new URL('./fixtures/moonPost.posting.jsonc', import.meta.url)
);

const { timezone, latitude, longitude } = observer;

const postDayOffset: Record<PostDay, number> = {
  prev: -1,
  same: 0,
  next: 1,
};

/**
 * "2026-12-31" → Date in the observer's timezone at the start of that day.
 */
function dateFromString(dateStr: string): Date {
  return new Date(
    Temporal.PlainDate.from(dateStr)
      .toZonedDateTime(timezone)
      .epochMilliseconds
  );
}

function resolvePostDate(eventDate: string, postDay: PostDay): string {
  return Temporal.PlainDate.from(eventDate)
    .add({ days: postDayOffset[postDay] })
    .toString();
}

describe('calculateMoonPost() posts on the correct date', () => {
  for (const fixture of fixtures) {
    const postDate = resolvePostDate(fixture.eventDate, fixture.postDay);
    const label = fixture.postDay === 'same'
      ? `${fixture.phase} moon ${fixture.eventDate} → posts same day`
      : `${fixture.phase} moon ${fixture.eventDate} → posts ${fixture.postDay} day (${postDate})`;

    it(label, () => {
      const date = dateFromString(postDate);
      const result = calculateMoonPost(date, timezone, latitude, longitude);
      expect(result.doPost).toBe(true);
      expect(result.phase).toBe(fixture.phase);
    });
  }
});

describe('calculateMoonPost() does not post on adjacent dates', () => {
  for (const fixture of fixtures) {
    const postDate = resolvePostDate(fixture.eventDate, fixture.postDay);
    const dayBefore = resolvePostDate(fixture.eventDate, 'prev');
    const dayAfter = resolvePostDate(fixture.eventDate, 'next');

    if (dayBefore !== postDate) {
      it(`${fixture.phase} moon ${fixture.eventDate} → does NOT post day before`, () => {
        const result = calculateMoonPost(dateFromString(dayBefore), timezone, latitude, longitude);
        expect(result.doPost).toBe(false);
      });
    }

    if (dayAfter !== postDate) {
      it(`${fixture.phase} moon ${fixture.eventDate} → does NOT post day after`, () => {
        const result = calculateMoonPost(dateFromString(dayAfter), timezone, latitude, longitude);
        expect(result.doPost).toBe(false);
      });
    }
  }
});

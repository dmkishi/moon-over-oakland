/**
 * Verifies that `renderPost()` prints each post's moonrise and moonset in the
 * observer's local time, against every principal phase of 2026, and that
 * `renderAltText()` describes the image in that time too.
 *
 * Posting rules at `./fixtures/phase-event.posting.jsonc`.
 */
import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { phaseEventFixtures } from './fixtures/index.ts';
import { observer } from '../src/observer.ts';
import { renderAltText, renderPost } from '../src/post.ts';
import { postOn } from './support/observer.ts';
import { postDateOf } from './support/time.ts';

const { timezone } = observer;

/**
 * Times must be formatted in the observer's zone, not the host's. Some bugs
 * that leak the host's zone only appear when that zone observes DST, so every
 * test runs in the production host's zone (see `Dockerfile`), even under the
 * UTC project.
 */
const HOST_TIMEZONE = 'America/Los_Angeles';

beforeAll(() => {
  vi.stubEnv('TZ', HOST_TIMEZONE);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

/**
 * The template's time format, e.g. "1:30 pm", "12-noon", "12-midnight".
 * @pure
 */
function formatTime(zoned: Temporal.ZonedDateTime): string {
  if (zoned.minute === 0 && zoned.hour === 0) return '12-midnight';
  if (zoned.minute === 0 && zoned.hour === 12) return '12-noon';
  const hour = zoned.hour % 12 || 12;
  const minute = String(zoned.minute).padStart(2, '0');
  return `${hour}:${minute} ${zoned.hour < 12 ? 'am' : 'pm'}`;
}

/**
 * Reads the time off a line such as "• Moonrise: 11:30 pm (yesterday)".
 * @pure
 */
function timeOnLine(post: string, label: string): string | undefined {
  return new RegExp(`^• ${label}: (\\S+(?: [ap]m)?)`, 'mu').exec(post)?.[1];
}

function render(postDate: Temporal.PlainDate) {
  const phaseEvent = postOn(postDate);
  return { phaseEvent, post: renderPost(phaseEvent, timezone) };
}

describe('host timezone', () => {
  it(`is ${HOST_TIMEZONE}`, () => {
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(HOST_TIMEZONE);
  });
});

describe('renderPost', () => {
  // The last quarter post for 2026-11-01 shows the moonrise from 10-31 at
  // 23:30 PDT, the night of the DST change. LiquidJS once rendered it as
  // 10:30 pm.
  it('prints the 2026-11-01 moonrise in PDT', () => {
    const { post } = render(Temporal.PlainDate.from('2026-11-01'));
    expect(post).toContain('• Moonrise: 11:30 pm (yesterday)');
  });

  it.each(phaseEventFixtures.map((fixture) => ({ postDate: postDateOf(fixture).toString() })))('prints the moonrise and moonset for $postDate in local time', ({ postDate }) => {
    const { phaseEvent, post } = render(Temporal.PlainDate.from(postDate));
    expect(timeOnLine(post, 'Moonrise')).toBe(formatTime(phaseEvent.dayEvents.moonrise));
    expect(timeOnLine(post, 'Moonset')).toBe(formatTime(phaseEvent.dayEvents.moonset));
  });
});

// Asserts only the computed parts, so the copy can change without editing this.
describe('renderAltText', () => {
  it('prints the illumination to one decimal place', () => {
    const { phaseEvent } = render(Temporal.PlainDate.from('2026-10-25'));
    expect(renderAltText(phaseEvent, 0.9984, timezone)).toContain('99.8%');
  });

  it.each(phaseEventFixtures.map((fixture) => ({ postDate: postDateOf(fixture).toString() })))('prints the phase and local time for $postDate', ({ postDate }) => {
    const { phaseEvent } = render(Temporal.PlainDate.from(postDate));
    const alt = renderAltText(phaseEvent, 0.5, timezone);
    expect(alt).toMatch(new RegExp(`${phaseEvent.type.replace('-', ' ')} moon`, 'iu'));
    expect(alt).toContain(formatTime(phaseEvent.time.withTimeZone(timezone)));
  });
});

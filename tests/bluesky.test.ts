import { describe, it, expect } from 'vitest';
import { graphemeLength, localDateOf, MAX_GRAPHEMES } from '../src/bluesky.ts';
import { observer } from '../src/observer.ts';

const { timezone } = observer;

describe('graphemeLength', () => {
  it('counts an empty string as zero', () => {
    expect(graphemeLength('')).toBe(0);
  });

  it('counts ASCII one per character', () => {
    expect(graphemeLength('Four')).toBe(4);
  });

  it('counts a newline', () => {
    expect(graphemeLength('a\nb')).toBe(3);
  });

  // Every case below is longer than one grapheme when measured by `.length`,
  // which is exactly the mismeasurement `getGraphemeLength` exists to avoid.
  it.each([
    ['letter with a combining accent', 'é'],
    ['emoji', '🌕'],
    ['emoji w/ two code points', '🇺🇸'],
    ['emoji w/ zero-width joiner', '👨‍👩‍👧‍👦'],
    ['emoji w/ skin-tone modifier', '👍🏽'],
  ])('counts %s as one grapheme', (_label, text) => {
    expect(text.length).toBeGreaterThan(1);
    expect(graphemeLength(text)).toBe(1);
  });

  // `main.ts` compares this count against `MAX_GRAPHEMES` to decide whether a
  // post fits, so the two have to be measured in the same unit.
  it('measures a full-length post in the same unit as MAX_GRAPHEMES', () => {
    expect(graphemeLength('🌕'.repeat(MAX_GRAPHEMES))).toBe(MAX_GRAPHEMES);
  });
});

describe('localDateOf', () => {
  it('reads the calendar date of an instant', () => {
    expect(localDateOf({ createdAt: '2026-03-15T19:30:00.000Z' }, timezone)?.toString())
      .toBe('2026-03-15');
  });

  // A record written late in the local evening carries the next day's UTC date,
  // which is the case that makes a naive `createdAt.slice(0, 10)` wrong.
  it('keeps an instant on the local day, not the UTC one', () => {
    expect(localDateOf({ createdAt: '2026-03-16T02:00:00.000Z' }, timezone)?.toString())
      .toBe('2026-03-15');
  });

  // Identical UTC wall times, six months apart: the offset shift alone decides
  // which local day each one lands on.
  it('applies the offset in force at the instant, not a fixed one', () => {
    expect(localDateOf({ createdAt: '2026-01-01T07:30:00.000Z' }, timezone)?.toString())
      .toBe('2025-12-31');
    expect(localDateOf({ createdAt: '2026-07-01T07:30:00.000Z' }, timezone)?.toString())
      .toBe('2026-07-01');
  });

  it('accepts a timestamp that carries its own offset', () => {
    expect(localDateOf({ createdAt: '2026-03-15T20:30:00+01:00' }, timezone)?.toString())
      .toBe('2026-03-15');
  });

  // The annotation names a zone, but the caller's `timezone` is what the date
  // is read in.
  it('ignores a timezone annotation on the timestamp', () => {
    expect(localDateOf({ createdAt: '2026-03-15T19:30:00.000Z[Asia/Tokyo]' }, timezone)?.toString())
      .toBe('2026-03-15');
  });

  it('reads the same instant the same way in any timezone', () => {
    const createdAt = '2026-03-16T02:00:00.000Z';
    expect(localDateOf({ createdAt }, 'UTC')?.toString()).toBe('2026-03-16');
    expect(localDateOf({ createdAt }, 'Asia/Tokyo')?.toString()).toBe('2026-03-16');
    expect(localDateOf({ createdAt }, timezone)?.toString()).toBe('2026-03-15');
  });

  it('returns null when createdAt is absent', () => {
    expect(localDateOf({}, timezone)).toBeNull();
    expect(localDateOf({ text: 'no timestamp here' }, timezone)).toBeNull();
  });

  it.each([
    ['a number', 1_773_607_800_000],
    ['null', null],
    ['undefined', undefined],
    ['an object', { seconds: 0 }],
    ['an array of strings', ['2026-03-15T19:30:00.000Z']],
  ])('returns null when createdAt is %s', (_label, createdAt) => {
    expect(localDateOf({ createdAt }, timezone)).toBeNull();
  });

  // `Temporal.Instant.from` rejects anything that is not a fixed point in time,
  // a calendar date among them.
  it.each([
    '',
    'yesterday',
    '2026-03-15',
    '2026-03-15T19:30:00',
    '2026-02-30T19:30:00.000Z',
  ])('returns null for the unparsable timestamp %j', (createdAt) => {
    expect(localDateOf({ createdAt }, timezone)).toBeNull();
  });

  it('returns null for an unknown timezone', () => {
    expect(localDateOf({ createdAt: '2026-03-15T19:30:00.000Z' }, 'Not/AZone')).toBeNull();
  });
});

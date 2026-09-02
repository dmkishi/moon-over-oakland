import { describe, it, expect } from 'vitest';
import { Temporal } from 'temporal-polyfill/implementation';
import { parseCliArgs } from '../src/args.ts';

describe('parseCliArgs', () => {
  it('defaults to no date and a live run', () => {
    expect(parseCliArgs([])).toEqual({ date: undefined, isDryRun: false });
  });

  it('reads the dry-run flag', () => {
    expect(parseCliArgs(['--dry-run']).isDryRun).toBe(true);
  });

  it('accepts the flag on either side of the date', () => {
    const before = parseCliArgs(['--dry-run', '2000-01-31']);
    const after = parseCliArgs(['2000-01-31', '--dry-run']);
    expect(before).toEqual(after);
    expect(after.isDryRun).toBe(true);
  });

  it('rejects more than one positional', () => {
    expect(() => parseCliArgs(['2000-01-31', '2000-02-01'])).toThrow('Too many arguments');
  });

  it('rejects an unknown option', () => {
    expect(() => parseCliArgs(['--nope'])).toThrow(/ERR_PARSE_ARGS_UNKNOWN_OPTION|--nope/);
  });
});

describe('parseCliArgs date parsing', () => {
  it('parses a calendar date', () => {
    const { date } = parseCliArgs(['2000-01-31']);
    expect(date).toBeInstanceOf(Temporal.PlainDate);
    expect(date!.toString()).toBe('2000-01-31');
  });

  it('accepts month and day without a leading zero', () => {
    expect(parseCliArgs(['2000-1-3']).date!.toString()).toBe('2000-01-03');
  });

  it('keeps a leap day that exists', () => {
    expect(parseCliArgs(['2000-02-29']).date!.toString()).toBe('2000-02-29');
  });

  // `overflow: 'reject'` is what stops these from being clamped into range.
  it.each(['2000-02-30', '1900-02-29', '2000-13-01', '2000-01-32', '2000-00-01', '2000-01-00'])(
    'rejects the out-of-range date %s',
    (value) => {
      expect(() => parseCliArgs([value])).toThrow(`Invalid date: "${value}"`);
    },
  );

  // The regex guard exists because `PlainDate.from` would happily swallow all
  // of these, silently discarding the time, offset, or calendar.
  it.each([
    '2000-01-31T12:00',
    '2000-01-31T12:00:00Z',
    '2000-01-31[u-ca=hebrew]',
    '2000-01-31+01:00',
    '20000131',
    '2000-01',
    '00-01-31',
    '+002000-01-31',
    ' 2000-01-31',
    '2000-01-31 ',
    'tomorrow',
  ])('rejects the non-calendar-date input %s', (value) => {
    expect(() => parseCliArgs([value])).toThrow(`Invalid date: "${value}"`);
  });
});

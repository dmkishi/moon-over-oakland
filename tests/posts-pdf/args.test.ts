// oxlint-disable unicorn/numeric-separators-style - Years read as years, not 2_026
import { describe, it, expect } from 'vitest';
import { parsePostsPdfArgs, UsageError } from '../../scripts/posts-pdf/args.ts';

describe('parsePostsPdfArgs', () => {
  it('defaults to the current year, in the current directory', () => {
    expect(parsePostsPdfArgs([], 2026)).toEqual({
      year: 2026,
      out: 'moon-over-oakland-2026.pdf',
      isHtmlKept: false,
    });
  });

  it('names the default file after the given year', () => {
    expect(parsePostsPdfArgs(['2027'], 2026)).toMatchObject({ year: 2027, out: 'moon-over-oakland-2027.pdf' });
  });

  it('reads --out and --html on either side of the year', () => {
    expect(parsePostsPdfArgs(['--html', '2027', '--out', 'out/moon.pdf'])).toEqual({
      year: 2027,
      out: 'out/moon.pdf',
      isHtmlKept: true,
    });
    expect(parsePostsPdfArgs(['-o', 'moon.pdf'], 2026).out).toBe('moon.pdf');
  });

  it.each(['27', '20270', '2027-01-01', 'next'])('rejects %s as a year', (arg) => {
    expect(() => parsePostsPdfArgs([arg])).toThrow(UsageError);
  });

  it('rejects more than one year', () => {
    expect(() => parsePostsPdfArgs(['2026', '2027'])).toThrow(UsageError);
  });

  it('rejects an empty --out', () => {
    expect(() => parsePostsPdfArgs(['--out', ''])).toThrow(UsageError);
  });

  it('rejects unknown flags', () => {
    expect(() => parsePostsPdfArgs(['--nope'])).toThrow(expect.objectContaining({
      code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION',
    }));
  });
});

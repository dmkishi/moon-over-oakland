import sharp from 'sharp';
import { describe, it, expect } from 'vitest';
import { renderInlineImage, supportsInlineImages } from '../src/terminal-image.ts';

const PREFIX = '\u001B]1337;File=inline=1;';
const BEL = '\u0007';

describe('supportsInlineImages', () => {
  it.each(['iTerm.app', 'vscode', 'WezTerm'])('is true for TERM_PROGRAM=%s', (program) => {
    expect(supportsInlineImages({ TERM_PROGRAM: program }, true)).toBe(true);
  });

  it('is true for LC_TERMINAL=iTerm2 alone, as over SSH', () => {
    expect(supportsInlineImages({ LC_TERMINAL: 'iTerm2' }, true)).toBe(true);
  });

  it('is false when not a TTY', () => {
    expect(supportsInlineImages({ TERM_PROGRAM: 'iTerm.app', LC_TERMINAL: 'iTerm2' }, false)).toBe(false);
  });

  it('is false under tmux', () => {
    expect(supportsInlineImages({ LC_TERMINAL: 'iTerm2', TMUX: '/tmp/tmux-501/default,1,0' }, true)).toBe(false);
  });

  it.each(['Apple_Terminal', 'ghostty'])('is false for TERM_PROGRAM=%s', (program) => {
    expect(supportsInlineImages({ TERM_PROGRAM: program }, true)).toBe(false);
  });

  it('is false for an empty env', () => {
    expect(supportsInlineImages({}, true)).toBe(false);
  });
});

describe('renderInlineImage', () => {
  it('wraps a downscaled JPEG in an OSC 1337 sequence', async () => {
    const jpeg = await sharp({
      create: { width: 1_000, height: 1_000, channels: 3, background: { r: 200, g: 200, b: 200 } },
    }).jpeg().toBuffer();

    const sequence = await renderInlineImage(jpeg);
    expect(sequence.startsWith(PREFIX)).toBe(true);
    expect(sequence.endsWith(BEL)).toBe(true);

    const [args = '', base64 = ''] = sequence.slice(PREFIX.length, -BEL.length).split(':');
    const size = /(?:^|;)size=(?<size>\d+)(?:;|$)/u.exec(args)?.groups?.size;
    const payload = Buffer.from(base64, 'base64');
    expect(Number(size)).toBe(payload.byteLength);

    const metadata = await sharp(payload).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBeLessThanOrEqual(512);
  });
});

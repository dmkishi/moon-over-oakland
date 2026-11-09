import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { ChromeNotFoundError, findChrome } from '../../scripts/posts-pdf/chrome.ts';

describe('findChrome', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'posts-pdf-test-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('prefers CHROME_PATH', () => {
    expect(findChrome({ CHROME_PATH: process.execPath }, 'linux')).toBe(process.execPath);
  });

  it('rejects a CHROME_PATH that does not exist', () => {
    expect(() => findChrome({ CHROME_PATH: join(dir, 'nope') }, 'linux')).toThrow(ChromeNotFoundError);
  });

  it('looks for Chromium on the PATH on Linux', async () => {
    const chromium = join(dir, 'chromium');
    await writeFile(chromium, '');
    expect(findChrome({ PATH: dir }, 'linux')).toBe(chromium);
  });

  it('reports when nothing is found', () => {
    expect(() => findChrome({ PATH: dir }, 'linux')).toThrow(ChromeNotFoundError);
  });
});

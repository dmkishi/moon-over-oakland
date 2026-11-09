/**
 * Prints every post the posting code would make over a year to a PDF: a
 * summary table, then each post's text with its phase instant, rise and set
 * times, deltas, illumination, alt text, and length. Moon images are left out.
 * Needs an installed Chrome or Chromium (or `CHROME_PATH`).
 *
 * @usage pnpm posts-pdf [YYYY] [--out <path>] [--html]
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, format, join, parse, relative, resolve } from 'node:path';
import pc from 'picocolors';
import { observer } from '../../src/observer.ts';
import { parsePostsPdfArgs, UsageError } from './args.ts';
import { ChromeNotFoundError, printPdf } from './chrome.ts';
import { collectPosts } from './collect.ts';
import { renderYearHtml } from './html.ts';

/**
 * E.g. "moon-over-oakland-2026.pdf", or an absolute path outside the current
 * directory.
 */
function displayPath(path: string): string {
  const fromCwd = relative(process.cwd(), path);
  return fromCwd.startsWith('..') ? path : fromCwd;
}

try {
  const { year, out, isHtmlKept } = parsePostsPdfArgs(process.argv.slice(2));
  const pdfPath = resolve(out);

  const posts = collectPosts(year);
  const html = renderYearHtml(year, posts, Temporal.Now.plainDateISO(observer.timezone));

  // Kept HTML sits beside the PDF; otherwise it's printed from a temp file.
  const tempDir = isHtmlKept ? undefined : await mkdtemp(join(tmpdir(), 'moon-over-oakland-posts-'));
  const htmlPath = tempDir === undefined
    ? format({ ...parse(pdfPath), base: '', ext: '.html' })
    : join(tempDir, `posts-${year}.html`);

  try {
    await mkdir(dirname(pdfPath), { recursive: true });
    await writeFile(htmlPath, html);
    await printPdf(htmlPath, pdfPath);
  } finally {
    if (tempDir !== undefined) await rm(tempDir, { recursive: true, force: true });
  }

  console.log(`${posts.length} posts for ${year} → ${pc.green(displayPath(pdfPath))}`);
  if (isHtmlKept) console.log(`HTML → ${displayPath(htmlPath)}`);
} catch (error) {
  // Node's own argument errors (unknown flag, missing value) are usage errors
  // too, so they report the same way. A missing Chrome is reported without a
  // stack. Anything else keeps its stack.
  const isUsage = error instanceof UsageError || (
    error instanceof Error &&
    'code' in error &&
    String(error.code).startsWith('ERR_PARSE_ARGS_')
  );
  if (!isUsage && !(error instanceof ChromeNotFoundError)) throw error;

  console.error(pc.red(error.message));
  if (isUsage) console.error('Usage: pnpm posts-pdf [YYYY] [--out <path>] [--html]');
  process.exitCode = 1;
}

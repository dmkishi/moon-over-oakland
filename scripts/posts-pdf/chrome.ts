/**
 * Prints an HTML file to PDF with an installed Chrome or Chromium, headless.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PRINT_TIMEOUT_MS = 120_000;

const MAC_APPS = [
  'Google Chrome.app/Contents/MacOS/Google Chrome',
  'Chromium.app/Contents/MacOS/Chromium',
];
const LINUX_COMMANDS = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];

export class ChromeNotFoundError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'ChromeNotFoundError';
  }
}

/**
 * The Chrome binary to print with: `CHROME_PATH` when set, otherwise the first
 * installed Chrome or Chromium in the usual places.
 */
export function findChrome(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const override = env.CHROME_PATH;
  if (override !== undefined && override !== '') {
    if (!existsSync(override)) throw new ChromeNotFoundError(`CHROME_PATH does not exist: ${override}`);
    return override;
  }

  const candidates = platform === 'darwin'
    ? ['/Applications', join(homedir(), 'Applications')].flatMap((dir) => MAC_APPS.map((app) => join(dir, app)))
    : (env.PATH ?? '').split(delimiter).filter(Boolean).flatMap((dir) => LINUX_COMMANDS.map((command) => join(dir, command)));

  const found = candidates.find((path) => existsSync(path));
  if (found === undefined) {
    throw new ChromeNotFoundError('Chrome or Chromium not found. Install one, or set CHROME_PATH to its binary.');
  }
  return found;
}

export async function printPdf(htmlPath: string, pdfPath: string, chrome: string = findChrome()): Promise<void> {
  // Remove an earlier run's PDF so the check below can't pass on a stale file.
  await rm(pdfPath, { force: true });
  // A throwaway profile keeps the headless run clear of an open Chrome's lock.
  const profile = await mkdtemp(join(tmpdir(), 'moon-over-oakland-chrome-'));
  try {
    // Piped, so Chrome's routine stderr noise stays out of the terminal but
    // still lands in the error if it fails.
    execFileSync(chrome, [
      '--headless',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--user-data-dir=${profile}`,
      `--print-to-pdf=${pdfPath}`,
      pathToFileURL(htmlPath).href,
    ], { timeout: PRINT_TIMEOUT_MS, stdio: 'pipe' });
  } finally {
    await rm(profile, { recursive: true, force: true });
  }

  // Chrome can exit 0 without writing anything, e.g. on an unwritable path.
  if (!existsSync(pdfPath) || (await stat(pdfPath)).size === 0) {
    throw new Error(`Chrome did not write ${pdfPath}`);
  }
}

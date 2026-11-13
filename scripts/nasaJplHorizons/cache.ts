/**
 * An on-disk cache of Horizons responses, keyed on the full request URL.
 *
 * Ephemerides for a fixed URL don't change short of JPL updating the DE
 * version, so a repeat run can be answered from disk. Each entry holds the
 * untouched response body, ready to be copied into `tests/fixtures/horizons/`.
 *
 * Entries are named `<body>-<YYYY-MM-DD>-<hash12>.txt`, where the date is the
 * UT date of the first time requested and `hash12` the first 12 hex digits of
 * the URL's SHA-256. A sidecar `<same name>.url` holds the URL, so a hash
 * collision reads as a miss. Entries never expire.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Body } from './api.ts';

/**
 * At the repo root, resolved from this module rather than `process.cwd()`, so
 * it is the same wherever `pnpm horizons` runs from. Not the OS cache
 * directory, which macOS purges under disk pressure, and not
 * `node_modules/.cache/`, which a clean install wipes.
 */
const DEFAULT_DIR = new URL('../../.cache/horizons/', import.meta.url);

/**
 * What a request is for, to name its entry: the body and the UT date of its
 * first time.
 */
interface EntryLabel {
  body: Body;
  /** `YYYY-MM-DD` */
  date: string;
}

interface CachedResponse {
  raw: string;
  /** Where the entry lives, for an error to point at */
  path: string;
}

export interface ResponseCache {
  /** `undefined` on a miss, and always when refreshing */
  read: (url: string, label: EntryLabel) => Promise<CachedResponse | undefined>;
  write: (url: string, label: EntryLabel, raw: string) => Promise<void>;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/**
 * Read a file, or `undefined` if there isn't one.
 */
async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/**
 * Write through a temp file in the same directory, so a crash never leaves
 * half an entry.
 */
async function writeAtomically(path: string, content: string): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, content);
  await rename(temp, path);
}

/**
 * @param options.dir - Where entries live. Defaults to `.cache/horizons/` at
 *   the repo root.
 * @param options.refresh - Skip every read, so each request is sent again and
 *   its entry overwritten
 */
export function createResponseCache(
  { dir = DEFAULT_DIR, refresh = false }: { dir?: string | URL; refresh?: boolean } = {},
): ResponseCache {
  const dirPath = dir instanceof URL ? fileURLToPath(dir) : dir;

  const entryPath = (url: string, { body, date }: EntryLabel): string => {
    const hash12 = createHash('sha256').update(url).digest('hex').slice(0, 12);
    return join(dirPath, `${body}-${date}-${hash12}.txt`);
  };

  return {
    async read(url, label) {
      const path = entryPath(url, label);
      const isHit = !refresh && await readIfPresent(`${path}.url`) === url;
      const raw = isHit ? await readIfPresent(path) : undefined;
      return raw === undefined ? undefined : { raw, path };
    },

    async write(url, label, raw) {
      const path = entryPath(url, label);
      await mkdir(dirPath, { recursive: true });
      // The body first: a body without its sidecar is still a miss.
      await writeAtomically(path, raw);
      await writeAtomically(`${path}.url`, url);
    },
  };
}

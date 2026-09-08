/**
 * Guards which `temporal-polyfill` entry point the code imports.
 *
 * The package's default entry (`temporal-polyfill`) resolves to
 * `globalThis.Temporal` whenever one exists. Node already ships Temporal behind
 * `--harmony-temporal`; once it is unflagged, a bare import would resolve to
 * native while every other site kept resolving to the polyfill. The two do not
 * interoperate — a polyfill method called on a native instance throws
 * `TypeError: Invalid calling context`. `temporal-polyfill/implementation`
 * returns the polyfill unconditionally, so every site agrees on one
 * implementation.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = join(import.meta.dirname, '..');

// Covers `from '…'`, `import('…')`, and the side-effect `import '…'`.
const BARE_ENTRY = /(?:\bfrom|\bimport\s*\(?)\s*'(?:@js-temporal\/polyfill|temporal-polyfill)'/u;

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts'))
    .map((name) => join(dir, name));
}

describe('temporal polyfill entry point', () => {
  it.each(['src', 'scripts', 'tests'].flatMap((dir) => sourceFiles(dir)))(
    '%s imports the implementation entry',
    (file) => {
      const source = readFileSync(join(ROOT, file), 'utf8');
      expect(source).not.toMatch(BARE_ENTRY);
    },
  );
});

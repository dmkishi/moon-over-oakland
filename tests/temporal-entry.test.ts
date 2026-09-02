/**
 * Guards which `temporal-polyfill` entry point the code imports.
 *
 * The package's default entry (`temporal-polyfill`) resolves to
 * `globalThis.Temporal` whenever one exists. The Cloudflare Workers runtime
 * exposes a global `Temporal` whose `Temporal.Now` reports 1970-01-01, so
 * deferring to it would silently date every post to the epoch.
 * `temporal-polyfill/implementation` returns the polyfill unconditionally.
 *
 * See `PLANS/cloudflare-workers-migration.md`.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { Temporal } from 'temporal-polyfill/implementation';

const EPOCH_DATE = '1970-01-01';
const ENTRY = 'temporal-polyfill/implementation';
const ROOT = join(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts'))
    .map((name) => join(dir, name));
}

describe('temporal polyfill entry point', () => {
  it('reports the real date, not the epoch', () => {
    expect(Temporal.Now.plainDateISO().toString()).not.toBe(EPOCH_DATE);
  });

  // The bare specifier is the hazard: it is the entry that defers to a global.
  it.each(['src', 'scripts', 'tests'].flatMap(sourceFiles))(
    '%s imports the implementation entry',
    (file) => {
      const source = readFileSync(join(ROOT, file), 'utf8');
      expect(source).not.toMatch(/from '(@js-temporal\/polyfill|temporal-polyfill)'/);
    },
  );

  // Proves the entry itself ignores a global, rather than trusting that it does.
  // Needs a fresh process: vitest externalizes node_modules, so the package is
  // evaluated once by Node and `vi.resetModules()` cannot re-run it.
  it('ignores a global Temporal', () => {
    const script = `
      globalThis.Temporal = { Now: { plainDateISO: () => '${EPOCH_DATE}' } };
      const { Temporal } = await import('${ENTRY}');
      console.log(Temporal.Now.plainDateISO().toString());
    `;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(output.trim()).not.toBe(EPOCH_DATE);
  });
});

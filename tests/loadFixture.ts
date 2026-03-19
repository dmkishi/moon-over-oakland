/**
 * Loads a JSON fixture file, stripping comments before parsing.
 */
import { readFileSync } from 'node:fs';
import stripJsonComments from 'strip-json-comments';

export function loadFixture<T>(url: URL): T {
  const raw = readFileSync(url, 'utf-8');
  return JSON.parse(stripJsonComments(raw));
}

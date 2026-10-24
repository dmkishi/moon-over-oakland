/**
 * Replays Horizons responses through `scripts/nasaJplHorizons/` in place of
 * the live API.
 *
 * Every query goes through `fetchColumns`, so stubbing `fetch` puts a saved
 * response through all of the decoding: the `$$SOE`/`$$EOE` split, header
 * lookup, flag columns, and UT row stamps.
 *
 * The saved responses in `../fixtures/horizons/` are the untouched bodies the
 * fetchers received, captured by wrapping `fetch` around one call of each:
 *
 * - `sky-2026-02-24-*`: `fetchMoonEphemeris` from 17:30 to 19:00 PST, which
 *   holds sunset, and the Moon's transit at ~80°, near enough the zenith to
 *   amplify a frame error in the tilt.
 * - `phase-2026-11-01-*`: `resolvePhaseEvent` on the 25-hour day DST ends, which
 *   holds a last quarter.
 * - `phase-2026-11-08-*`: `resolvePhaseEvent` on a day whose new moon falls at
 *   23:02, an hour short of midnight.
 * - `disc-*`: `fetchMoonDiscs` at two instants of `moon-disc.accuracy.jsonc`.
 */
import { readFileSync } from 'node:fs';
import { onTestFinished, vi } from 'vitest';
import type { Body } from '../../scripts/nasaJplHorizons/api.ts';

/**
 * The target IDs `api.ts` sends as `COMMAND`, repeated here rather than
 * imported so that a request for the wrong body fails the test.
 */
const BODY_BY_COMMAND: Record<string, Body> = { "'301'": 'moon', "'10'": 'sun' };

/**
 * The text of a saved response, by its name in `../fixtures/horizons/`.
 */
export function savedResponse(name: string): string {
  return readFileSync(new URL(`../fixtures/horizons/${name}.txt`, import.meta.url), 'utf8');
}

/**
 * A minimal response holding one CSV table, for cases no saved response
 * covers. Like Horizons, every line ends in a comma.
 */
export function horizonsTable(header: string, rows: string[]): string {
  return [`${header},`, '*****', '$$SOE', ...rows.map((row) => `${row},`), '$$EOE', ''].join('\n');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A UT row stamp as Horizons prints it, e.g. "2026-Nov-01 07:00".
 */
export function horizonsStamp(instant: Temporal.Instant): string {
  const utc = instant.toZonedDateTimeISO('UTC');
  const month = MONTHS[utc.month - 1];
  const time = utc.toPlainTime().toString({ smallestUnit: 'minute' });
  return `${utc.year}-${month}-${String(utc.day).padStart(2, '0')} ${time}`;
}

/**
 * Stub `fetch` to answer each request with the response for the body it asks
 * for, until the end of the test.
 *
 * @param responses - Response text, or a function returning a `Response` for
 *   a reply that isn't a table, such as an error status
 * @returns The query parameters of every request, in the order they were sent
 */
export function replayHorizons(
  responses: Partial<Record<Body, string | (() => Response)>>,
): URLSearchParams[] {
  const requests: URLSearchParams[] = [];

  vi.stubGlobal('fetch', (url: string) => {
    const params = new URL(url).searchParams;
    requests.push(params);
    const body = BODY_BY_COMMAND[params.get('COMMAND') ?? ''];
    const response = body === undefined ? undefined : responses[body];
    if (response === undefined) {
      return Promise.reject(new Error(`No response to replay for COMMAND=${params.get('COMMAND')}`));
    }
    return Promise.resolve(typeof response === 'string' ? new Response(response) : response());
  });
  // Each request logs its URL.
  vi.spyOn(console, 'error').mockImplementation(() => {});

  onTestFinished(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  return requests;
}

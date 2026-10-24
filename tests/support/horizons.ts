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
import { vi } from 'vitest';
import type { Body, TableQuery } from '../../scripts/nasaJplHorizons/api.ts';
import { SITE } from '../../scripts/nasaJplHorizons/site.ts';

/**
 * A wall-clock time at the site.
 */
export function zoned(dateTime: string): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from(`${dateTime}[${SITE.timezone}]`);
}

/**
 * The window of the `sky-2026-02-24-*` captures.
 */
export const SKY_WINDOW = { start: zoned('2026-02-24T17:30'), end: zoned('2026-02-24T19:00') };

/**
 * The Moon's table query `fetchMoonEphemeris` makes of `SKY_WINDOW`: a row a
 * minute, stopping a minute short of the end.
 */
export const SKY_QUERY: TableQuery = {
  body: 'moon',
  site: SITE,
  start: SKY_WINDOW.start,
  stop: SKY_WINDOW.end.subtract({ minutes: 1 }),
  stepSize: '1m',
};

/**
 * The instants of the `disc-*` captures.
 */
export const DISC_INSTANTS = ['2026-01-10T15:48:29Z', '2026-08-24T19:00:00Z']
  .map((instant) => Temporal.Instant.from(instant));

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
 * for. `unstubGlobals` and `restoreMocks` in `vitest.config.ts` undo the stub
 * before the next test.
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

  return requests;
}

/**
 * Replay a capture's `<name>-moon` and `<name>-sun` responses.
 *
 * @param sun - Response text in place of the saved Sun response
 * @returns The query parameters of every request, in the order they were sent
 */
export function replayCapture(name: string, sun = savedResponse(`${name}-sun`)): URLSearchParams[] {
  return replayHorizons({ moon: savedResponse(`${name}-moon`), sun });
}

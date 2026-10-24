import { describe, it, expect } from 'vitest';
import { AU_TO_KM } from '../../scripts/nasaJplHorizons/api.ts';
import { civilDay, SITE } from '../../scripts/nasaJplHorizons/site.ts';
import {
  fetchMoonEphemeris,
  thinEphemeris,
  type MoonEphemeris,
  type MoonEventName,
} from '../../scripts/nasaJplHorizons/sky/ephemeris.ts';
import { replayCapture, savedResponse, SKY_WINDOW } from '../support/horizons.ts';

describe('fetchMoonEphemeris', () => {
  it('asks for the Moon and Sun a minute at a time, short of the end', async () => {
    const requests = replayCapture('sky-2026-02-24');
    await fetchMoonEphemeris(SITE, SKY_WINDOW);
    for (const params of requests) {
      expect(Object.fromEntries(params)).toMatchObject({
        START_TIME: "'2026-02-25 01:30'",
        STOP_TIME: "'2026-02-25 02:59'",
        STEP_SIZE: "'1m'",
      });
    }
    expect(new Set(requests.map((params) => params.get('COMMAND')))).toEqual(new Set(["'301'", "'10'"]));
  });

  it('returns a row a minute on the local clock', async () => {
    replayCapture('sky-2026-02-24');
    const rows = await fetchMoonEphemeris(SITE, SKY_WINDOW);
    expect(rows).toHaveLength(90);
    expect(rows[0]!.at.toString()).toBe('2026-02-24T17:30:00-08:00[America/Los_Angeles]');
    expect(rows.at(-1)!.at.toString()).toBe('2026-02-24T18:59:00-08:00[America/Los_Angeles]');
  });

  // Transit has a flag of its own. Sunset is where `*` stops.
  it('decodes the events from the flags', async () => {
    replayCapture('sky-2026-02-24');
    const rows = await fetchMoonEphemeris(SITE, SKY_WINDOW);
    const events = rows
      .filter((row) => row.events.length > 0)
      .map((row) => [row.at.toPlainTime().toString(), row.events]);
    expect(events).toEqual([['17:59:00', ['sunset']], ['18:39:00', ['transit']]]);
  });

  it('carries the readings through in their units', async () => {
    replayCapture('sky-2026-02-24');
    const [row] = await fetchMoonEphemeris(SITE, SKY_WINDOW);
    // ` 2026-Feb-25 01:30,*,m,    71.76971,    27.46961,  121.750315,
    //   72.666525,   3.6785723500,   56.51185,  0.00243375305934, -0.0890263,`
    expect(row).toMatchObject({
      flags: ['*', 'm'],
      azimuthDeg: 121.750315,
      altitudeDeg: 72.666525,
      illuminatedPercent: 56.51185,
      distanceKm: 0.00243375305934 * AU_TO_KM,
    });
  });

  it('rejects a Sun table that does not line up with the Moon', async () => {
    const sun = savedResponse('sky-2026-02-24-sun').replace(/^ 2026-Feb-25 01:30,.*\n/mu, '');
    replayCapture('sky-2026-02-24', sun);
    await expect(fetchMoonEphemeris(SITE, SKY_WINDOW))
      .rejects.toThrow('No Sun row for 2026-02-25T01:30:00Z');
  });
});

/**
 * A minute-by-minute grid across `date`'s civil day, with `events` keyed by
 * minutes elapsed since midnight. Elapsed rather than wall-clock minutes, so
 * that either pass through a fall-back day's repeated hour can be named.
 */
function minuteGrid(date: string, events: Record<number, MoonEventName[]> = {}): MoonEphemeris[] {
  const { start, end } = civilDay(date);
  const length = (end.epochMilliseconds - start.epochMilliseconds) / 60_000;
  return Array.from({ length }, (_, i) => ({
    at: start.add({ minutes: i }),
    flags: [],
    events: events[i] ?? [],
    azimuthDeg: 0,
    altitudeDeg: 0,
    illuminatedPercent: 0,
    distanceKm: 0,
    tiltDeg: 0,
  }));
}

/**
 * The wall-clock times that start a display row.
 */
function displayTimes(grid: MoonEphemeris[], intervalMinutes: number): string[] {
  return thinEphemeris(grid, intervalMinutes)
    .map(({ row }) => row.at.toPlainTime().toString({ smallestUnit: 'minute' }));
}

describe('thinEphemeris', () => {
  it('keeps a row on each multiple of the interval past midnight', () => {
    expect(displayTimes(minuteGrid('2026-02-24'), 180))
      .toEqual(['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00']);
  });

  it('starts 01:00 twice on the day DST ends', () => {
    const times = displayTimes(minuteGrid('2026-11-01'), 60);
    expect(times).toHaveLength(25);
    expect(times.slice(0, 4)).toEqual(['00:00', '01:00', '01:00', '02:00']);
  });

  it('never starts 02:00 on the day DST begins', () => {
    const times = displayTimes(minuteGrid('2026-03-08'), 60);
    expect(times).toHaveLength(23);
    expect(times.slice(0, 3)).toEqual(['00:00', '01:00', '03:00']);
  });

  it('folds each event into the interval in progress', () => {
    const grid = minuteGrid('2026-02-24', { 0: ['moonset'], 59: ['sunrise'], 60: ['transit'], 61: ['moonrise'] });
    const thinned = thinEphemeris(grid, 60).slice(0, 2);
    expect(thinned.map(({ events }) => events.map(({ name, at }) => [name, at.toPlainTime().toString()])))
      .toEqual([
        [['moonset', '00:00:00'], ['sunrise', '00:59:00']],
        [['transit', '01:00:00'], ['moonrise', '01:01:00']],
      ]);
  });

  // 01:30 comes round twice on the day DST ends, at 90 and 150 minutes elapsed.
  it('keeps the two passes through a repeated hour apart', () => {
    const grid = minuteGrid('2026-11-01', { 90: ['moonrise'], 150: ['moonset'] });
    const [, first, second] = thinEphemeris(grid, 60);
    expect(first!.events.map(({ name, at }) => [name, at.offset])).toEqual([['moonrise', '-07:00']]);
    expect(second!.events.map(({ name, at }) => [name, at.offset])).toEqual([['moonset', '-08:00']]);
  });
});

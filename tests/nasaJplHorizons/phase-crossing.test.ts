import { describe, it, expect } from 'vitest';
import { civilDay, type ObservingDay } from '../../scripts/nasaJplHorizons/site.ts';
import { resolvePhaseEvent } from '../../scripts/nasaJplHorizons/sky/phase-crossing.ts';
import { postingFixtures } from '../fixtures/helpers.ts';
import { horizonsStamp, horizonsTable, replayHorizons, savedResponse } from '../support/horizons.ts';

/**
 * An illumination range that always passes the gate in front of the fetch.
 */
const MAY_HOLD_PHASE = [0.5, 50];

/**
 * Replay the `phase-<date>-*` captures, and return the requests made.
 */
function replayPhaseDay(date: string): URLSearchParams[] {
  return replayHorizons({
    moon: savedResponse(`phase-${date}-moon`),
    sun: savedResponse(`phase-${date}-sun`),
  });
}

describe('resolvePhaseEvent against Horizons', () => {
  // The 25-hour day DST ends: 07:00 UT to 08:00 UT the next day.
  it('asks for both bodies across the whole civil day, every 10 minutes', async () => {
    const requests = replayPhaseDay('2026-11-01');
    await resolvePhaseEvent(civilDay('2026-11-01'), MAY_HOLD_PHASE);
    expect(requests).toHaveLength(2);
    for (const params of requests) {
      expect(params.get('CENTER')).toBe("'500@399'");
      expect(params.get('QUANTITIES')).toBe("'31'");
      expect(params.get('START_TIME')).toBe("'2026-11-01 07:00'");
      expect(params.get('STOP_TIME')).toBe("'2026-11-02 08:00'");
      expect(params.get('STEP_SIZE')).toBe("'10m'");
    }
  });

  // The 2026-11-01 last quarter falls after the repeated hour, so the elapsed
  // time has to carry it onto the right offset. The 2026-11-08 new moon
  // crosses the 360°→0° rollover.
  it.each(['2026-11-01', '2026-11-08'])('finds the phase that %s holds', async (date) => {
    const fixture = postingFixtures.find(({ eventDate }) => eventDate === date)!;
    replayPhaseDay(date);
    const event = await resolvePhaseEvent(civilDay(date), MAY_HOLD_PHASE);

    expect(event?.name).toBe(fixture.phaseType);
    // Formatted as `pnpm horizons sky` prints the fixture, truncated to the
    // second.
    expect(event!.at.toString({ smallestUnit: 'second', timeZoneName: 'never' })).toBe(fixture.dateTime);
  });

  // The gate's bands are the worst-case illumination at a principal instant.
  it.each([
    ['a crescent', [10, 20], 0],
    ['a gibbous', [60, 75], 0],
    ['a new moon', [0.2, 3], 2],
    ['a quarter', [45, 49], 2],
    ['a full moon', [97, 99.8], 2],
  ])('for %s day, makes %d requests', async (_label, illuminatedPercents, requestCount) => {
    const requests = replayPhaseDay('2026-11-01');
    await resolvePhaseEvent(civilDay('2026-11-01'), illuminatedPercents);
    expect(requests).toHaveLength(requestCount);
  });
});

/**
 * Ecliptic longitude tables across `day`, a row every 10 minutes through its
 * end: the Sun's fixed at 0°, the Moon's from `moonLonDeg(i)` for row `i`.
 */
function longitudeTables(day: ObservingDay, moonLonDeg: (i: number) => number) {
  const length = (day.end.epochMilliseconds - day.start.epochMilliseconds) / 600_000 + 1;
  const stamps = Array.from({ length }, (_, i) => horizonsStamp(day.start.add({ minutes: 10 * i }).toInstant()));
  const table = (lon: (i: number) => number) => horizonsTable(
    ' Date__(UT)__HR:MN, , ,    ObsEcLon,   ObsEcLat',
    stamps.map((stamp, i) => ` ${stamp}, , , ${lon(i).toFixed(7)},  0.0000000`),
  );
  return { moon: table(moonLonDeg), sun: table(() => 0) };
}

/**
 * Synthetic tables, at 0.5° a row rather than the Moon's ~0.085°, so that a
 * crossing can be placed to well under a millisecond. A day then sweeps 72°,
 * short of the 90° between phases.
 */
describe('resolvePhaseEvent on synthetic tables', () => {
  const day = civilDay('2026-11-09');
  const DEG_PER_ROW = 0.5;
  // 24 hours of 10-minute rows, so row 144 is the next day's midnight.
  const LAST_ROW = 144;

  it('interpolates between rows', async () => {
    replayHorizons(longitudeTables(day, (i) => 90 + (i - 72.5) * DEG_PER_ROW));
    const event = await resolvePhaseEvent(day, MAY_HOLD_PHASE);
    expect(event?.name).toBe('first-quarter');
    expect(event?.at.toString()).toBe('2026-11-09T12:05:00-08:00[America/Los_Angeles]');
  });

  it('returns null for a day with no crossing', async () => {
    replayHorizons(longitudeTables(day, (i) => 100 + i * DEG_PER_ROW));
    expect(await resolvePhaseEvent(day, MAY_HOLD_PHASE)).toBeNull();
  });

  it('leaves a crossing at midnight to the next day', async () => {
    replayHorizons(longitudeTables(day, (i) => 180 + (i - LAST_ROW) * DEG_PER_ROW));
    expect(await resolvePhaseEvent(day, MAY_HOLD_PHASE)).toBeNull();
  });

  // 0.0000001° short of midnight is 0.12 ms, which would round up to midnight.
  it('keeps a crossing just short of midnight on this day', async () => {
    replayHorizons(longitudeTables(day, (i) => 180.0000001 + (i - LAST_ROW) * DEG_PER_ROW));
    const event = await resolvePhaseEvent(day, MAY_HOLD_PHASE);
    expect(event?.name).toBe('full');
    expect(event?.at.toString()).toBe('2026-11-09T23:59:59.999-08:00[America/Los_Angeles]');
  });

  it('rejects tables of different lengths', async () => {
    const { moon, sun } = longitudeTables(day, (i) => 100 + i * DEG_PER_ROW);
    replayHorizons({ moon, sun: sun.replace(/^.*2026-Nov-09 08:00.*\n/mu, '') });
    await expect(resolvePhaseEvent(day, MAY_HOLD_PHASE))
      .rejects.toThrow('Moon has 145 rows, Sun has 144');
  });
});

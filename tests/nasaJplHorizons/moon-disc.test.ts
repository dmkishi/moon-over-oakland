import { describe, it, expect, vi } from 'vitest';
import { fetchMoonDiscs, printMoonDiscFixture } from '../../scripts/nasaJplHorizons/disc/moon-disc.ts';
import { civilDay } from '../../scripts/nasaJplHorizons/site.ts';
import { moonDiscFixtures } from '../fixtures/helpers.ts';
import { replayHorizons, savedResponse } from '../support/horizons.ts';

/**
 * The `moon-disc.accuracy.jsonc` rows the `disc-*` captures were taken at.
 */
const FIXTURES = ['2026-01-10T15:48:29Z', '2026-08-24T19:00:00Z']
  .map((instant) => moonDiscFixtures.find((fixture) => fixture.instant === instant)!);

const replayDisc = () => replayHorizons({
  moon: savedResponse('disc-moon'),
  sun: savedResponse('disc-sun'),
});

describe('fetchMoonDiscs', () => {
  it('spans a day hourly, short of the next midnight', async () => {
    const requests = replayDisc();
    await fetchMoonDiscs(civilDay('2026-08-24'));
    for (const params of requests) {
      expect(params.get('CENTER')).toBe("'500@399'");
      expect(params.get('START_TIME')).toBe("'2026-08-24 07:00'");
      expect(params.get('STOP_TIME')).toBe("'2026-08-25 06:59'");
      expect(params.get('STEP_SIZE')).toBe("'1h'");
    }
  });

  // The whole path from response to fixture: decoding, the bright limb from
  // two tables, the unit conversions, longitudes wrapped to ±180°, and the
  // rounding the fixture is printed with.
  it('regenerates the fixture rows it was captured for', async () => {
    replayDisc();
    const discs = await fetchMoonDiscs({
      instants: FIXTURES.map(({ instant }) => Temporal.Instant.from(instant)),
    });

    printMoonDiscFixture(discs.map((disc, i) => ({ description: FIXTURES[i]!.description, disc })));
    const printed = vi.mocked(console.log).mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.startsWith('  {'))
      .map((line) => JSON.parse(line.trim().replace(/,$/u, '')) as unknown);
    expect(printed).toEqual(FIXTURES);
  });
});

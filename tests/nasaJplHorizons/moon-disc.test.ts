import { describe, it, expect, vi } from 'vitest';
import { fetchMoonDiscs, printMoonDiscFixture } from '../../scripts/nasaJplHorizons/disc/moon-disc.ts';
import { civilDay } from '../../scripts/nasaJplHorizons/site.ts';
import { moonDiscFixtures } from '../fixtures/index.ts';
import { DISC_INSTANTS, replayCapture } from '../support/horizons.ts';

/**
 * The `moon-disc.accuracy.jsonc` rows the `disc-*` captures were taken at.
 */
const FIXTURES = DISC_INSTANTS
  .map((instant) => moonDiscFixtures.find((fixture) => fixture.instant === instant.toString())!);

describe('fetchMoonDiscs', () => {
  it('spans a day hourly, short of the next midnight', async () => {
    const requests = replayCapture('disc');
    await fetchMoonDiscs(civilDay('2026-08-24'));
    for (const params of requests) {
      expect(Object.fromEntries(params)).toMatchObject({
        CENTER: "'500@399'",
        START_TIME: "'2026-08-24 07:00'",
        STOP_TIME: "'2026-08-25 06:59'",
        STEP_SIZE: "'1h'",
      });
    }
  });

  // The whole path from response to fixture: decoding, the bright limb from
  // two tables, the unit conversions, longitudes wrapped to ±180°, and the
  // rounding the fixture is printed with.
  it('regenerates the fixture rows it was captured for', async () => {
    replayCapture('disc');
    const discs = await fetchMoonDiscs({ instants: DISC_INSTANTS });

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    printMoonDiscFixture(discs.map((disc, i) => ({ description: FIXTURES[i]!.description, disc })));
    const printed = log.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.startsWith('  {'))
      .map((line) => JSON.parse(line.trim().replace(/,$/u, '')) as unknown);
    expect(printed).toEqual(FIXTURES);
  });
});

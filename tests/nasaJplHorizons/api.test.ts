/**
 * Checks `fetchColumns` both ways: the request it derives from a query and a
 * list of columns, and how it decodes the reply, replayed from saved Horizons
 * responses (see `../support/horizons.ts`).
 */
import { describe, it, expect } from 'vitest';
import { fetchColumns, type TableQuery } from '../../scripts/nasaJplHorizons/api.ts';
import { SITE } from '../../scripts/nasaJplHorizons/site.ts';
import { horizonsTable, replayHorizons, savedResponse } from '../support/horizons.ts';

const zoned = (dateTime: string) => Temporal.ZonedDateTime.from(`${dateTime}[${SITE.timezone}]`);

/**
 * The window of the `sky-2026-02-24-*` captures.
 */
const SKY_WINDOW: TableQuery = {
  body: 'moon',
  site: SITE,
  start: zoned('2026-02-24T17:30'),
  stop: zoned('2026-02-24T18:59'),
  stepSize: '1m',
};

/**
 * The instants of the `disc-*` captures.
 */
const DISC_INSTANTS = ['2026-01-10T15:48:29Z', '2026-08-24T19:00:00Z'].map((s) => Temporal.Instant.from(s));

describe('fetchColumns', () => {
  describe('request', () => {
    // Azimuth and altitude are one quantity, as are RA and Dec.
    it('asks for each quantity the columns need, once and in order', async () => {
      const requests = replayHorizons({ moon: savedResponse('sky-2026-02-24-moon') });
      await fetchColumns(SKY_WINDOW, ['distanceAu', 'altitudeDeg', 'apparentRightAscensionDeg', 'azimuthDeg']);
      expect(requests[0]!.get('QUANTITIES')).toBe("'2,4,20'");
    });

    it('sends a window as UT clock times', async () => {
      const requests = replayHorizons({ moon: savedResponse('sky-2026-02-24-moon') });
      await fetchColumns(SKY_WINDOW, ['altitudeDeg']);
      const params = requests[0]!;
      expect(params.get('START_TIME')).toBe("'2026-02-25 01:30'");
      expect(params.get('STOP_TIME')).toBe("'2026-02-25 02:59'");
      expect(params.get('STEP_SIZE')).toBe("'1m'");
      expect(params.has('TLIST')).toBe(false);
    });

    it('places the site by longitude, latitude, and elevation in km', async () => {
      const requests = replayHorizons({ moon: savedResponse('sky-2026-02-24-moon') });
      await fetchColumns(SKY_WINDOW, ['altitudeDeg']);
      const params = requests[0]!;
      expect(params.get('CENTER')).toBe("'coord@399'");
      expect(params.get('SITE_COORD')).toBe(`'${SITE.longitude},${SITE.latitude},0.02'`);
    });

    it("puts a geocentric table at Earth's center", async () => {
      const requests = replayHorizons({ moon: savedResponse('sky-2026-02-24-moon') });
      await fetchColumns({ ...SKY_WINDOW, site: 'geocentric' }, ['altitudeDeg']);
      const params = requests[0]!;
      expect(params.get('CENTER')).toBe("'500@399'");
      expect(params.has('SITE_COORD')).toBe(false);
    });

    it('sends a list of instants as a TLIST, to the second', async () => {
      const requests = replayHorizons({ moon: savedResponse('disc-moon') });
      await fetchColumns({ body: 'moon', site: 'geocentric', instants: DISC_INSTANTS }, ['illuminatedPercent']);
      const params = requests[0]!;
      expect(params.get('TLIST')).toBe("'2026-01-10 15:48:29' '2026-08-24 19:00:00'");
      expect(params.get('TLIST_TYPE')).toBe("'CAL'");
      expect(params.get('TIME_TYPE')).toBe("'UT'");
      expect(params.has('START_TIME')).toBe(false);
    });

    it('splits a long TLIST into requests of ten', async () => {
      const requests = replayHorizons({ moon: savedResponse('disc-moon') });
      const start = Temporal.Instant.from('2026-01-01T00:00:00Z');
      const instants = Array.from({ length: 25 }, (_, i) => start.add({ hours: i }));
      const rows = await fetchColumns({ body: 'moon', site: 'geocentric', instants }, ['illuminatedPercent']);

      const sizes = requests.map((params) => params.get('TLIST')!.split("' '").length);
      expect(sizes).toEqual([10, 10, 5]);
      // Every batch is answered by the same two-row capture.
      expect(rows).toHaveLength(6);
    });
  });

  describe('reply', () => {
    it('reads each row stamp as UT', async () => {
      replayHorizons({ moon: savedResponse('sky-2026-02-24-moon') });
      const rows = await fetchColumns(SKY_WINDOW, ['altitudeDeg']);
      expect(rows).toHaveLength(90);
      expect(rows[0]!.at.toString()).toBe('2026-02-25T01:30:00Z');
      expect(rows.at(-1)!.at.toString()).toBe('2026-02-25T02:59:00Z');
    });

    it('reads a TLIST row stamp to the second', async () => {
      replayHorizons({ moon: savedResponse('disc-moon') });
      const rows = await fetchColumns({ body: 'moon', site: 'geocentric', instants: DISC_INSTANTS }, ['illuminatedPercent']);
      expect(rows.map(({ at }) => at.toString())).toEqual(DISC_INSTANTS.map(String));
    });

    it('reads each column by its header, wherever it sits', async () => {
      replayHorizons({ moon: savedResponse('sky-2026-02-24-moon') });
      const [row] = await fetchColumns(SKY_WINDOW, ['distanceAu', 'altitudeDeg', 'apparentRightAscensionDeg']);
      // ` 2026-Feb-25 01:30,*,m,    71.76971,    27.46961,  121.750315,
      //   72.666525,   3.6785723500,   56.51185,  0.00243375305934, -0.0890263,`
      expect(row!.values).toEqual({
        distanceAu: 0.00243375305934,
        altitudeDeg: 72.666525,
        apparentRightAscensionDeg: 71.76971,
      });
    });

    // The capture's rows carry `*` (daylight) or a twilight letter, then `m`
    // (Moon up) or `t` (transit).
    it('reads the flag columns, dropping blanks', async () => {
      replayHorizons({ moon: savedResponse('sky-2026-02-24-moon') });
      const rows = await fetchColumns(SKY_WINDOW, ['altitudeDeg']);
      expect(rows[0]!.flags).toEqual(['*', 'm']);
      expect(rows.find(({ flags }) => flags.includes('t'))!.flags).toEqual(['N', 't']);
    });

    it('reads a geocentric row as flagless', async () => {
      replayHorizons({ moon: savedResponse('phase-2026-11-01-moon') });
      const rows = await fetchColumns({ ...SKY_WINDOW, site: 'geocentric' }, ['eclipticLonDeg']);
      expect(rows.every(({ flags }) => flags.length === 0)).toBe(true);
    });

    it('hands over the untouched response', async () => {
      const raw = savedResponse('sky-2026-02-24-moon');
      replayHorizons({ moon: raw });
      let received: string | undefined;
      await fetchColumns({ ...SKY_WINDOW, onRawResponse: (text) => { received = text; } }, ['altitudeDeg']);
      expect(received).toBe(raw);
    });
  });

  describe('failures', () => {
    const HEADER = ' Date__(UT)__HR:MN, , ,R.A._(a-app), DEC_(a-app)';

    it('rejects an HTTP error', async () => {
      replayHorizons({ moon: () => new Response('', { status: 503, statusText: 'Service Unavailable' }) });
      await expect(fetchColumns(SKY_WINDOW, ['altitudeDeg']))
        .rejects.toThrow('Horizons API error: 503 Service Unavailable');
    });

    // As when Horizons answers with an error message instead of a table.
    it('rejects a reply with no table', async () => {
      replayHorizons({ moon: savedResponse('sky-2026-02-24-moon').replace('$$SOE', '') });
      await expect(fetchColumns(SKY_WINDOW, ['altitudeDeg'])).rejects.toThrow('$$SOE/$$EOE');
    });

    it('rejects a row with a cell too few', async () => {
      replayHorizons({ moon: horizonsTable(HEADER, [' 2026-Feb-25 01:30,*,m,   338.20183']) });
      await expect(fetchColumns(SKY_WINDOW, ['apparentRightAscensionDeg']))
        .rejects.toThrow('Horizons row has 5 columns, expected 6');
    });

    // Horizons prints `n.a.` for a quantity it can't compute.
    it('rejects a cell that is not a number', async () => {
      replayHorizons({ moon: horizonsTable(HEADER, [' 2026-Feb-25 01:30,*,m,   n.a.,    -9.14607']) });
      await expect(fetchColumns(SKY_WINDOW, ['apparentRightAscensionDeg']))
        .rejects.toThrow('Horizons column 3 is not a number');
    });

    it('rejects a reply missing a requested column', async () => {
      replayHorizons({ moon: horizonsTable(HEADER, [' 2026-Feb-25 01:30,*,m,   338.20183,    -9.14607']) });
      await expect(fetchColumns(SKY_WINDOW, ['altitudeDeg']))
        .rejects.toThrow(String.raw`Column matching /Elev_\(a-app\)/u not found`);
    });

    it('rejects a row stamp in an unknown month', async () => {
      replayHorizons({ moon: horizonsTable(HEADER, [' 2026-Fbr-25 01:30,*,m,   338.20183,    -9.14607']) });
      await expect(fetchColumns(SKY_WINDOW, ['apparentRightAscensionDeg']))
        .rejects.toThrow('Unrecognized month in Horizons datetime: 2026-Fbr-25 01:30');
    });

    // Requests are queued one at a time, so this is about the queue as much as
    // the request.
    it('lets the requests queued behind a failure go ahead', async () => {
      replayHorizons({
        moon: () => new Response('', { status: 500 }),
        sun: savedResponse('sky-2026-02-24-sun'),
      });
      const [moon, sun] = await Promise.allSettled([
        fetchColumns(SKY_WINDOW, ['apparentRightAscensionDeg']),
        fetchColumns({ ...SKY_WINDOW, body: 'sun' }, ['apparentRightAscensionDeg']),
      ]);
      expect(moon.status).toBe('rejected');
      expect(sun.status).toBe('fulfilled');
    });
  });
});

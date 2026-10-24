/**
 * Verifies the moon image's geometry on test textures: a uniform albedo and
 * flat terrain, so every lit pixel is lit by the sphere alone and nothing
 * depends on NASA's maps.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { describe, it, expect } from 'vitest';
import { moonDisc, type MoonDisc } from '../src/ephemeris/moon-disc.ts';
import {
  loadMoonTextures,
  MAX_IMAGE_BYTES,
  type MoonTextures,
  renderMoonImage,
  renderMoonPixels,
} from '../src/moon-image.ts';
import { DEG } from './support/angle.ts';

const SIZE = 256;

/** Height-map value for 0 km: half-meters above 1727.4 km. */
const ZERO_KM = 20_000;

const ALBEDO = 180;

/** Instants from `./fixtures/moon-disc.accuracy.jsonc` */
const INSTANTS = {
  crescent: '2026-10-14T19:00:00Z',
  firstQuarter: '2026-10-18T16:12:37Z',
  gibbous: '2026-08-24T19:00:00Z',
  lastQuarter: '2026-11-01T20:28:28Z',
  /** Libration l = −7.6°, b = −3.6°, so the disc center is far from (0°, 0°) */
  librated: '2026-12-17T05:42:41Z',
};

/**
 * A 1 px/deg map with a uniform albedo and flat terrain. `paint` may darken
 * texels by selenographic longitude and latitude.
 */
function testTextures(paint?: (lon: number, lat: number) => number | undefined): MoonTextures {
  const width = 360;
  const height = 180;
  const color = new Uint8Array(width * height * 3).fill(ALBEDO);
  if (paint) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = paint(x + 0.5 - 180, 90 - y - 0.5);
        if (value !== undefined) color.fill(value, (y * width + x) * 3, (y * width + x + 1) * 3);
      }
    }
  }
  return {
    color: { width, height, data: color },
    height: { width, height, data: new Uint16Array(width * height).fill(ZERO_KM) },
  };
}

function discAt(instant: string): MoonDisc {
  return moonDisc(Temporal.Instant.from(instant));
}

/**
 * Pixels matching `test`, with their offsets from the frame's center in px:
 * x toward celestial west (right), y toward celestial north (up).
 */
function matching(pixels: Uint8Array, test: (value: number) => boolean): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (test(pixels[(row * SIZE + col) * 3]!)) {
        points.push({ x: col + 0.5 - SIZE / 2, y: SIZE / 2 - row - 0.5 });
      }
    }
  }
  return points;
}

function centroid(points: { x: number; y: number }[]): { x: number; y: number } {
  const sum = points.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/** Position angle of an offset, from north toward east (left). */
function positionAngle({ x, y }: { x: number; y: number }): number {
  return ((Math.atan2(-x, y) / DEG) + 360) % 360;
}

function radiusPx(disc: MoonDisc): number {
  return (0.9 * SIZE / 33.5) * disc.angularDiameterArcmin / 2;
}

/**
 * Centroid of the black marker painted on an otherwise earthshine-lit disc,
 * clear of the dim, anti-aliased limb.
 */
function markerCentroid(pixels: Uint8Array, disc: MoonDisc): { x: number; y: number } {
  const dark = matching(pixels, (value) => value < 30);
  return centroid(dark.filter(({ x, y }) => Math.hypot(x, y) < radiusPx(disc) - 2));
}

describe('renderMoonPixels geometry', () => {
  const textures = testTextures();

  it.each(['crescent', 'firstQuarter', 'gibbous', 'lastQuarter'] as const)(
    'lights the illuminated fraction of the disc (%s)',
    (name) => {
      const disc = discAt(INSTANTS[name]);
      const pixels = renderMoonPixels(disc, textures, { size: SIZE });
      const lit = matching(pixels, (value) => value > 0).length / (Math.PI * radiusPx(disc) ** 2);
      expect(lit).toBeNear(disc.illuminatedFraction, 0.01);
    },
  );

  it.each(['crescent', 'firstQuarter', 'gibbous', 'lastQuarter'] as const)(
    'turns the lit side toward the bright limb position angle (%s)',
    (name) => {
      const disc = discAt(INSTANTS[name]);
      const pixels = renderMoonPixels(disc, textures, { size: SIZE });
      const angle = positionAngle(centroid(matching(pixels, (value) => value > 0)));
      expect(angle).toBeWithinAngle(disc.brightLimbPositionAngle, 2);
    },
  );

  it('lights the first quarter on the right and the last quarter on the left', () => {
    const lit = (instant: string) => {
      const pixels = renderMoonPixels(discAt(instant), textures, { size: SIZE });
      return centroid(matching(pixels, (value) => value > 0));
    };
    expect(lit(INSTANTS.firstQuarter).x).toBeGreaterThan(radiusPx(discAt(INSTANTS.firstQuarter)) / 3);
    expect(lit(INSTANTS.lastQuarter).x).toBeLessThan(-radiusPx(discAt(INSTANTS.lastQuarter)) / 3);
  });

  it('sizes the disc by the plate scale', () => {
    // Earthshine lights the whole disc, so its full width can be measured.
    const disc = discAt(INSTANTS.firstQuarter);
    const pixels = renderMoonPixels(disc, textures, { size: SIZE, earthshine: true });
    const middleRow = matching(pixels, (value) => value > 0).filter(({ y }) => y === 0.5);
    expect(middleRow.length).toBeNear(2 * radiusPx(disc), 1);
  });

  it('places selenographic (0°, 0°) where libration and P put it', () => {
    const disc = discAt(INSTANTS.librated);
    const marked = testTextures((lon, lat) => (Math.abs(lon) < 2 && Math.abs(lat) < 2 ? 0 : undefined));
    const pixels = renderMoonPixels(disc, marked, { size: SIZE, earthshine: true });
    const marker = markerCentroid(pixels, disc);

    // Orthographic projection of (0°, 0°) about the sub-Earth point (l, b),
    // the Moon's north up, then turned counterclockwise by P.
    const { lon: l, lat: b } = disc.subEarth;
    const x = -Math.sin(l * DEG);
    const y = -Math.cos(l * DEG) * Math.sin(b * DEG);
    const p = disc.axisPositionAngle * DEG;
    const expected = {
      x: radiusPx(disc) * (x * Math.cos(p) - y * Math.sin(p)),
      y: radiusPx(disc) * (x * Math.sin(p) + y * Math.cos(p)),
    };

    expect(Math.hypot(expected.x, expected.y)).toBeGreaterThan(10); // A real offset, not ~0
    expect(marker.x).toBeNear(expected.x, 1.5);
    expect(marker.y).toBeNear(expected.y, 1.5);
  });

  // IAU east, toward Mare Crisium, is on the right of a north-up image. A map
  // or frame mirrored in longitude would put it on the left.
  it('puts selenographic east on the right', () => {
    const disc = discAt(INSTANTS.firstQuarter);
    const marked = testTextures((lon, lat) => (Math.abs(lon - 60) < 3 && Math.abs(lat) < 3 ? 0 : undefined));
    const pixels = renderMoonPixels(disc, marked, { size: SIZE, earthshine: true });
    const marker = markerCentroid(pixels, disc);
    expect(marker.x).toBeGreaterThan(radiusPx(disc) * 0.7);
  });

  it('leaves the sky black', () => {
    const pixels = renderMoonPixels(discAt(INSTANTS.gibbous), textures, { size: SIZE, earthshine: true });
    expect(pixels[0]).toBe(0);
    expect(pixels.at(-1)).toBe(0);
  });
});

describe('renderMoonImage', () => {
  it('encodes a JPEG within Bluesky’s limits', async () => {
    const image = await renderMoonImage(discAt(INSTANTS.gibbous), testTextures(), { size: SIZE });
    expect(image.jpeg.byteLength).toBeLessThanOrEqual(MAX_IMAGE_BYTES);
    expect([image.width, image.height]).toEqual([SIZE, SIZE]);
    const metadata = await sharp(image.jpeg).metadata();
    expect(metadata.format).toBe('jpeg');
    expect([metadata.width, metadata.height]).toEqual([SIZE, SIZE]);
  });

  it('rejects a frame over 4000 px', async () => {
    await expect(renderMoonImage(discAt(INSTANTS.gibbous), testTextures(), { size: 4_001 }))
      .rejects.toThrow(RangeError);
  });
});

function tempDir(): URL {
  const path = mkdtempSync(join(tmpdir(), 'moon-textures-'));
  return pathToFileURL(`${path}/`);
}

describe('loadMoonTextures', () => {
  it('reads 8-bit color and 16-bit height at full depth', async () => {
    const dir = tempDir();
    const color = Uint8Array.from({ length: 4 * 2 * 3 }, (_, i) => i * 10);
    const height = Uint16Array.from({ length: 4 * 2 }, (_, i) => 1_000 + i * 5_000);
    await sharp(color, { raw: { width: 4, height: 2, channels: 3 } })
      .png().toFile(new URL('moon-color.png', dir).pathname);
    await sharp(height, { raw: { width: 4, height: 2, channels: 1 } })
      .toColourspace('grey16').png().toFile(new URL('moon-height.png', dir).pathname);

    const textures = await loadMoonTextures(dir);
    expect(textures.color).toMatchObject({ width: 4, height: 2 });
    expect([...textures.color.data]).toEqual([...color]);
    expect(textures.height).toMatchObject({ width: 4, height: 2 });
    expect([...textures.height.data]).toEqual([...height]);
  });

  it('rejects a Git LFS pointer with instructions', async () => {
    const dir = tempDir();
    const pointer = 'version https://git-lfs.github.com/spec/v1\noid sha256:0000\nsize 123\n';
    writeFileSync(new URL('moon-color.png', dir), pointer);
    writeFileSync(new URL('moon-height.png', dir), pointer);
    await expect(loadMoonTextures(dir)).rejects.toThrow('git lfs pull');
  });
});

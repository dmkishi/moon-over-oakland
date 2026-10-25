/**
 * Renders the Moon as seen from Earth's center: celestial north up, celestial
 * west (the sunset side) on the right, lit by the Sun, sized to scale.
 *
 * Textures are NASA's CGI Moon Kit (`pnpm generate-moon-assets`): LROC color for albedo
 * and LOLA elevation for relief and cast shadows.
 *
 * See `docs/moon-attributes.md` and `docs/moon-render-elevation.md`.
 */
import { readFile } from 'node:fs/promises';
import { embedImages } from '@atcute/bluesky/limits';
import sharp from 'sharp';
import { MOON_RADIUS_KM, type MoonDisc } from './ephemeris/moon-disc.ts';

export const MAX_IMAGE_BYTES: number = embedImages.image.image.maxSize;

/** Not in the lexicon, but enforced by the Bluesky app and AppView. */
const MAX_IMAGE_SIDE = 4_000;

/** What Bluesky's CDN serves `fullsize` images at, at most. */
const DEFAULT_SIZE = 2_000;

/**
 * Largest geocentric angular diameter, at the closest perigees. Frames are a
 * fixed plate scale, so the Moon fills 90% of the frame then and less at any
 * other time, and apogee and perigee moons differ visibly.
 */
const MAX_DIAMETER_ARCMIN = 33.5;
const FILL = 0.9;

/** Mozjpeg qualities tried in turn until the JPEG fits `MAX_IMAGE_BYTES`. */
const JPEG_QUALITIES = [90, 85, 80, 70, 60];

/**
 * McEwen (1991) Lunar-Lambert weight, L(α) = 1 + Aα + Bα² + Cα³ with α in
 * degrees. The cubic crosses zero near α = 105°, past which the surface is
 * treated as purely Lambertian.
 */
const MCEWEN = { A: -0.019, B: 2.42e-4, C: -1.46e-6 };

/**
 * Sun elevation over the smooth sphere below which shadows are cast. Higher
 * than this, no crater on the Moon is steep or deep enough to shadow a point.
 */
const SHADOW_MAX_SUN_ELEVATION_DEG = 17;

/** Angular radius of the Sun seen from the Moon, which softens shadow edges. */
const SUN_RADIUS_DEG = 0.267;

/** Shadow rays step this fraction of a height texel. */
const SHADOW_STEP_TEXELS = 0.75;

/**
 * Earthshine at new moon, as a fraction of full sunlight. The real ratio is
 * ~1/10,000, too dark to show, so this is a stylization, and the alt text says
 * so.
 */
const EARTHSHINE_GAIN = 0.12;

/** Least cosine of emission a facet is shaded at; see `shade`. */
const MIN_COS_E = 0.2;

/** Supersampling per axis for pixels on the limb. */
const LIMB_SAMPLES = 3;

const DEG = Math.PI / 180;

/**
 * Equirectangular maps centered on 0° longitude: east to the right, north up.
 */
export interface MoonTextures {
  /** Albedo, 8-bit sRGB, 3 channels */
  color: { width: number; height: number; data: Uint8Array };
  /** NASA's encoding: half-meters above 1727.4 km, i.e. km = value / 2000 − 10 */
  height: { width: number; height: number; data: Uint16Array };
}

export interface MoonImage {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

/**
 * A direction to march toward, in the body frame, with its elevation over the
 * smooth sphere at the marching point and its angular radius in radians.
 */
interface LightSource {
  dir: readonly [number, number, number];
  sinElevation: number;
  radius: number;
}

export interface RenderOptions {
  /** Width and height of the square frame in px */
  size?: number;
  /** Light the disc from Earth too (new moon only) */
  earthshine?: boolean;
}

const SRGB_TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/**
 * Linear light (clipped to 0–1) to an 8-bit sRGB value.
 * @pure
 */
function linearToSrgb(linear: number): number {
  const c = Math.min(Math.max(linear, 0), 1);
  const srgb = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

/**
 * McEwen's L(α), clamped to the Lommel–Seeliger (1) and Lambert (0) limits.
 * @pure
 */
function lunarLambertWeight(phaseAngleDeg: number): number {
  const α = phaseAngleDeg;
  const weight = 1 + MCEWEN.A * α + MCEWEN.B * α ** 2 + MCEWEN.C * α ** 3;
  return Math.min(Math.max(weight, 0), 1);
}

/**
 * Lunar-Lambert reflectance (McEwen 1991).
 * @pure
 */
function lunarLambert(cosI: number, cosE: number, weight: number): number {
  return 2 * weight * cosI / (cosI + cosE) + (1 - weight) * cosI;
}

/**
 * Unit vector of a selenographic point in the Moon's body frame: x toward
 * 0° lon, y toward 90° E, z toward the north pole.
 * @pure
 */
function toVector(lonDeg: number, latDeg: number): [number, number, number] {
  const λ = lonDeg * DEG;
  const φ = latDeg * DEG;
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
}

/**
 * Fractional texel coordinates of (λ, φ), in radians, in an equirectangular
 * `width` × `rows` map. Longitude wraps; latitude clamps at the poles.
 * @pure
 */
function texel(λ: number, φ: number, width: number, rows: number) {
  const u = ((λ / Math.PI + 1) / 2) * width - 0.5;
  const v = (0.5 - φ / Math.PI) * rows - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  return {
    fx: u - x0,
    fy: v - y0,
    x0: ((x0 % width) + width) % width,
    x1: (((x0 + 1) % width) + width) % width,
    y0: Math.min(Math.max(y0, 0), rows - 1),
    y1: Math.min(Math.max(y0 + 1, 0), rows - 1),
  };
}

/**
 * Bilinear lookups into the textures, by selenographic longitude and latitude
 * in radians. Longitude wraps; latitude clamps at the poles.
 */
function createSampler({ color, height }: MoonTextures) {
  const albedo = (λ: number, φ: number, out: Float32Array) => {
    const { fx, fy, x0, x1, y0, y1 } = texel(λ, φ, color.width, color.height);
    const i00 = (y0 * color.width + x0) * 3;
    const i10 = (y0 * color.width + x1) * 3;
    const i01 = (y1 * color.width + x0) * 3;
    const i11 = (y1 * color.width + x1) * 3;
    for (let c = 0; c < 3; c++) {
      const top = SRGB_TO_LINEAR[color.data[i00 + c]!]! * (1 - fx) + SRGB_TO_LINEAR[color.data[i10 + c]!]! * fx;
      const bottom = SRGB_TO_LINEAR[color.data[i01 + c]!]! * (1 - fx) + SRGB_TO_LINEAR[color.data[i11 + c]!]! * fx;
      out[c] = top * (1 - fy) + bottom * fy;
    }
  };

  /** Height above the 1737.4 km sphere in km */
  const elevation = (λ: number, φ: number) => {
    const { fx, fy, x0, x1, y0, y1 } = texel(λ, φ, height.width, height.height);
    const row0 = y0 * height.width;
    const row1 = y1 * height.width;
    const top = height.data[row0 + x0]! * (1 - fx) + height.data[row0 + x1]! * fx;
    const bottom = height.data[row1 + x0]! * (1 - fx) + height.data[row1 + x1]! * fx;
    return (top * (1 - fy) + bottom * fy) / 2_000 - 10;
  };

  return { albedo, elevation };
}

/**
 * Highest point in the height map in km, where a shadow ray can stop.
 * @pure
 */
function maxElevation({ height }: MoonTextures): number {
  let max = 0;
  for (const value of height.data) {
    if (value > max) max = value;
  }
  return max / 2_000 - 10;
}

/**
 * Renders the disc into 8-bit sRGB pixels, 3 channels, on black.
 *
 * Each pixel is carried from the image plane to the globe:
 * 1. Rotate by −P, so the Moon's own north is up.
 * 2. Lift onto the unit sphere (orthographic: the Moon is ~1/220 of its
 *    distance across, so perspective moves the limb by ~0.26°).
 * 3. Express in the body frame, with the sub-Earth point (l, b) at the center.
 *
 * @internal Exported for testing.
 */
export function renderMoonPixels(
  disc: MoonDisc,
  textures: MoonTextures,
  { size = DEFAULT_SIZE, earthshine = false }: RenderOptions = {},
): Uint8Array {
  const sampler = createSampler(textures);
  const pixels = new Uint8Array(size * size * 3);

  const plateScale = (FILL * size) / MAX_DIAMETER_ARCMIN; // px per arcmin
  const radiusPx = (plateScale * disc.angularDiameterArcmin) / 2;
  const center = size / 2;
  const cosP = Math.cos(disc.axisPositionAngle * DEG);
  const sinP = Math.sin(disc.axisPositionAngle * DEG);

  // Body-frame axes of the image: `view` toward Earth, `up` the Moon's north
  // projected onto the sky, `right` = up × view, toward selenographic east.
  const view = toVector(disc.subEarth.lon, disc.subEarth.lat);
  const sun = toVector(disc.subSolar.lon, disc.subSolar.lat);
  const upNorm = Math.hypot(view[2] * view[0], view[2] * view[1], 1 - view[2] ** 2);
  const up = [-view[2] * view[0] / upNorm, -view[2] * view[1] / upNorm, (1 - view[2] ** 2) / upNorm] as const;
  const right = [
    up[1] * view[2] - up[2] * view[1],
    up[2] * view[0] - up[0] * view[2],
    up[0] * view[1] - up[1] * view[0],
  ] as const;

  // The phase angle as the image is lit: between the subsolar and sub-Earth
  // points. Equal to `disc.phaseAngle` to well under a degree.
  const sunDotView = sun[0] * view[0] + sun[1] * view[1] + sun[2] * view[2];
  const weight = lunarLambertWeight(Math.acos(sunDotView) / DEG);
  const normalization = lunarLambert(Math.cos(30 * DEG), 1, lunarLambertWeight(30));

  const heightTexel = Math.PI / textures.height.height; // radians
  const hMax = maxElevation(textures);
  const shadowStep = SHADOW_STEP_TEXELS * heightTexel;
  const sinShadowMax = Math.sin(SHADOW_MAX_SUN_ELEVATION_DEG * DEG);

  const albedo = new Float32Array(3);
  const sample = new Float32Array(3);
  const accumulator = new Float32Array(3);

  /**
   * Fraction of a light source that clears the terrain horizon at body point
   * `p` (unit vector) of terrain height `h0`, found by marching the height map
   * along the great circle toward the source.
   */
  const horizonVisibility = (
    p: readonly [number, number, number],
    h0: number,
    { dir, sinElevation, radius }: LightSource,
  ) => {
    const [px, py, pz] = p;
    const elevation = Math.asin(sinElevation);
    const top = elevation + radius;

    // Tangent toward the source.
    let tx = dir[0] - sinElevation * px;
    let ty = dir[1] - sinElevation * py;
    let tz = dir[2] - sinElevation * pz;
    const tNorm = Math.hypot(tx, ty, tz);
    if (tNorm < 1e-9) return 1;
    tx /= tNorm;
    ty /= tNorm;
    tz /= tNorm;

    const r0 = MOON_RADIUS_KM + h0;
    let horizon = -Math.PI / 2;
    for (let s = shadowStep; s < Math.PI / 4; s += shadowStep) {
      // A ray toward the top of the source is above all terrain from here on.
      const rayTop = (r0 * Math.cos(top)) / Math.cos(top + s) - MOON_RADIUS_KM;
      if (top + s >= Math.PI / 2 || rayTop > hMax) break;

      const cosS = Math.cos(s);
      const sinS = Math.sin(s);
      const qx = px * cosS + tx * sinS;
      const qy = py * cosS + ty * sinS;
      const qz = pz * cosS + tz * sinS;
      const rq = MOON_RADIUS_KM + sampler.elevation(Math.atan2(qy, qx), Math.asin(qz));

      // Elevation of the terrain point above p's horizon, in the plane of p
      // and the source: it sits at (rq·cos s − r0, rq·sin s) from p.
      const angle = Math.atan2(rq * cosS - r0, rq * sinS);
      if (angle > horizon) {
        horizon = angle;
        if (horizon >= top) return 0;
      }
    }

    const visible = (elevation - horizon) / (2 * radius) + 0.5;
    return Math.min(Math.max(visible, 0), 1);
  };

  /**
   * Fraction of the Sun lighting body point `p`. A shadow the viewer can't
   * see, because terrain toward Earth hides it, is not drawn: there is no
   * view ray tracing, so the hidden point would otherwise show through. This
   * matters near the limb at full moon, where Sun and viewer are nearly
   * behind each other and shadows fall on the far sides of ridges.
   */
  const sunlight = (p: readonly [number, number, number], h0: number, sinSun: number, sinView: number) => {
    if (sinSun >= sinShadowMax) return 1;
    const lit = horizonVisibility(p, h0, { dir: sun, sinElevation: sinSun, radius: SUN_RADIUS_DEG * DEG });
    if (lit === 1) return lit;
    const seen = horizonVisibility(p, h0, { dir: view, sinElevation: sinView, radius: SUN_RADIUS_DEG * DEG });
    return Math.max(lit, 1 - seen);
  };

  /**
   * Linear RGB of the surface at disc coordinates (x, y), the Moon's north
   * up, in units of the disc radius. Writes to `sample`.
   */
  const shade = (x: number, y: number) => {
    const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
    const px = x * right[0] + y * up[0] + z * view[0];
    const py = x * right[1] + y * up[1] + z * view[1];
    const pz = x * right[2] + y * up[2] + z * view[2];
    const λ = Math.atan2(py, px);
    const φ = Math.asin(Math.min(Math.max(pz, -1), 1));

    sampler.albedo(λ, φ, albedo);

    // Surface normal from height differences one texel apart, each slope in
    // km of rise per km along the true sphere.
    const cosφ = Math.max(Math.cos(φ), 1e-6);
    const h0 = sampler.elevation(λ, φ);
    const radius = MOON_RADIUS_KM + h0;
    const slopeEast = (sampler.elevation(λ + heightTexel, φ) - sampler.elevation(λ - heightTexel, φ))
      / (2 * heightTexel * radius * cosφ);
    const slopeNorth = (sampler.elevation(λ, φ + heightTexel) - sampler.elevation(λ, φ - heightTexel))
      / (2 * heightTexel * radius);
    const sinλ = Math.sin(λ);
    const cosλ = Math.cos(λ);
    const sinφ = Math.sin(φ);
    // normal = up − slopeEast·east − slopeNorth·north, with east and north the
    // local tangent directions at p.
    let nx = px + slopeEast * sinλ + slopeNorth * sinφ * cosλ;
    let ny = py - slopeEast * cosλ + slopeNorth * sinφ * sinλ;
    let nz = pz - slopeNorth * cosφ;
    let nNorm = Math.hypot(nx, ny, nz);
    nx /= nNorm;
    ny /= nNorm;
    nz /= nNorm;

    // A facet turned (nearly) away from Earth is hidden behind the terrain in
    // front of it, which faces Earth. Without view ray tracing the facet would
    // show anyway, dark near the limb at full moon, so blend its normal toward
    // the smooth sphere's until it faces Earth.
    let cosE = nx * view[0] + ny * view[1] + nz * view[2];
    // Screen area of the facet relative to the smooth sphere's at this point.
    const foreshortening = Math.min(Math.max(cosE / Math.max(z, 1e-6), 0), 1);
    if (cosE < MIN_COS_E) {
      const t = z > MIN_COS_E ? (MIN_COS_E - cosE) / (z - cosE) : 1;
      nx += t * (px - nx);
      ny += t * (py - ny);
      nz += t * (pz - nz);
      nNorm = Math.hypot(nx, ny, nz);
      nx /= nNorm;
      ny /= nNorm;
      nz /= nNorm;
      cosE = nx * view[0] + ny * view[1] + nz * view[2];
    }

    const cosI = nx * sun[0] + ny * sun[1] + nz * sun[2];
    let light = 0;
    if (cosI > 0) {
      const sinSun = px * sun[0] + py * sun[1] + pz * sun[2];
      // A shadow covers as much of the pixel as its facet does, which on a
      // slope turned from Earth is little: near the limb at full moon,
      // shadows fall on exactly those slopes.
      const shadow = (1 - sunlight([px, py, pz], h0, sinSun, z)) * foreshortening;
      light = (1 - shadow) * lunarLambert(cosI, cosE, weight) / normalization;
    }
    if (earthshine) {
      // Lit from the viewer: zero phase, so Lommel–Seeliger, a flat disc.
      light += EARTHSHINE_GAIN;
    }

    for (let c = 0; c < 3; c++) sample[c] = albedo[c]! * light;
  };

  const limbBand = Math.SQRT1_2 / radiusPx; // half a pixel's diagonal, in disc radii
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      // Sky coordinates in disc radii: X toward celestial west, Y north.
      const X = (col + 0.5 - center) / radiusPx;
      const Y = (center - row - 0.5) / radiusPx;
      const ρ = Math.hypot(X, Y);
      if (ρ > 1 + limbBand) continue;

      accumulator.fill(0);
      const samples = ρ < 1 - limbBand ? 1 : LIMB_SAMPLES;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const sampleX = X + ((sx + 0.5) / samples - 0.5) / radiusPx;
          const sampleY = Y - ((sy + 0.5) / samples - 0.5) / radiusPx;
          if (sampleX * sampleX + sampleY * sampleY >= 1) continue;
          // Undo the axis tilt: rotate the sky by −P.
          shade(sampleX * cosP + sampleY * sinP, -sampleX * sinP + sampleY * cosP);
          for (let c = 0; c < 3; c++) accumulator[c]! += sample[c]!;
        }
      }

      const offset = (row * size + col) * 3;
      for (let c = 0; c < 3; c++) {
        pixels[offset + c] = linearToSrgb(accumulator[c]! / (samples * samples));
      }
    }
  }

  return pixels;
}

/**
 * Renders the disc to a JPEG that fits Bluesky's image limits.
 */
export async function renderMoonImage(
  disc: MoonDisc,
  textures: MoonTextures,
  options: RenderOptions = {},
): Promise<MoonImage> {
  const size = options.size ?? DEFAULT_SIZE;
  if (size > MAX_IMAGE_SIDE) {
    throw new RangeError(`Image is ${size} px across, over Bluesky's ${MAX_IMAGE_SIDE} px.`);
  }

  const pixels = renderMoonPixels(disc, textures, options);
  const image = sharp(pixels, { raw: { width: size, height: size, channels: 3 } });
  for (const quality of JPEG_QUALITIES) {
    // Encodes are independent of one another, but each depends on the last
    // being too big, so they run in turn.
    // oxlint-disable-next-line no-await-in-loop
    const jpeg = await image.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (jpeg.byteLength <= MAX_IMAGE_BYTES) {
      return { jpeg, width: size, height: size };
    }
  }
  throw new RangeError(`No JPEG quality fits the image in ${MAX_IMAGE_BYTES} bytes.`);
}

const LFS_POINTER_HEADER = 'version https://git-lfs';

/**
 * Read a texture, refusing a Git LFS pointer, which sharp would otherwise
 * reject with an unhelpful decode error.
 */
async function readTexture(url: URL): Promise<Buffer> {
  const file = await readFile(url);
  if (file.subarray(0, LFS_POINTER_HEADER.length).toString('latin1') === LFS_POINTER_HEADER) {
    throw new Error(
      `${url.pathname} is a Git LFS pointer, not an image. Install git-lfs, then run \`git lfs pull\`.`,
    );
  }
  return file;
}

/**
 * Decode the textures generated by `pnpm generate-moon-assets`.
 */
export async function loadMoonTextures(
  dir: URL = new URL('../assets/', import.meta.url),
): Promise<MoonTextures> {
  const [colorFile, heightFile] = await Promise.all([
    readTexture(new URL('moon-color.png', dir)),
    readTexture(new URL('moon-height.png', dir)),
  ]);

  const color = await sharp(colorFile)
    .toColourspace('srgb')
    .removeAlpha()
    .raw({ depth: 'uchar' })
    .toBuffer({ resolveWithObject: true });

  // `toColourspace`, not `extractChannel`: sharp otherwise reads through 8-bit
  // sRGB and returns every height divided by 256.
  const height = await sharp(heightFile)
    .toColourspace('grey16')
    .raw({ depth: 'ushort' })
    .toBuffer({ resolveWithObject: true });

  // A Uint16Array view needs an even byte offset; copy only if it is odd.
  const heightBytes = height.data.byteOffset % 2 === 0
    ? height.data
    : new Uint8Array(height.data);

  return {
    color: {
      width: color.info.width,
      height: color.info.height,
      data: new Uint8Array(color.data.buffer, color.data.byteOffset, color.data.byteLength),
    },
    height: {
      width: height.info.width,
      height: height.info.height,
      data: new Uint16Array(heightBytes.buffer, heightBytes.byteOffset, heightBytes.byteLength / 2),
    },
  };
}

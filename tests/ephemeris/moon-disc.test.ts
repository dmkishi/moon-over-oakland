/**
 * Verifies `moonDisc()` against JPL Horizons' geocentric view of the disc at
 * every principal phase of 2026 and six instants between them.
 *
 * Horizons values at `../fixtures/moon-disc.accuracy.jsonc`.
 */
import { Coord, limb } from 'astronomia/base';
import vsop87Bearth from 'astronomia/data/vsop87Bearth';
import { Ecliptic } from 'astronomia/coord';
import { DateToJDE } from 'astronomia/julian';
import { position } from 'astronomia/moonposition';
import { meanObliquity, nutation } from 'astronomia/nutation';
import { Planet } from 'astronomia/planetposition';
import { apparentEquatorialVSOP87 } from 'astronomia/solar';
import { describe, it, expect } from 'vitest';
import { moonDiscFixtures } from '../fixtures/index.ts';
import { moonDisc } from '../../src/ephemeris/moon-disc.ts';
import { angleDiff, DEG, limbArc } from '../support/angle.ts';

/**
 * Tolerances, ~2–5x the largest residual across the fixture. Meeus ch. 53
 * works in the IAU frame and LRO in the Mean Earth frame, ~0.03° apart, which
 * is most of the libration residual.
 */
const TOLERANCE = {
  /** Degrees; residuals ≤ 0.028° */
  libration: 0.06,
  /** Degrees; residuals ≤ 0.007° */
  axisPositionAngle: 0.02,
  /**
   * Degrees of arc on the disc. The bright limb's direction is the direction
   * of the subsolar point's offset from the disc center, an offset that
   * shrinks as sin(i) toward full and new, so χ's own error grows as
   * 1/sin(i). Residuals ≤ 0.005°.
   */
  brightLimbArc: 0.015,
  /** Degrees; residuals ≤ 0.0012° */
  phaseAngle: 0.005,
  /** Residuals ≤ 0.000031 */
  illuminatedFraction: 0.0001,
  /** Meeus ch. 47's truncated series; residuals ≤ 42 km */
  distanceKm: 100,
  /** Arcminutes; residuals ≤ 0.0035′ */
  angularDiameterArcmin: 0.01,
};

describe('moonDisc vs Horizons', () => {
  describe.each(moonDiscFixtures)('$description at $instant', (fixture) => {
    const disc = () => moonDisc(Temporal.Instant.from(fixture.instant));

    it('places the disc center (libration l, b)', () => {
      const { subEarth } = disc();
      expect(subEarth.lon).toBeWithinAngle(fixture.subEarth.lon, TOLERANCE.libration);
      expect(subEarth.lat).toBeWithinAngle(fixture.subEarth.lat, TOLERANCE.libration);
    });

    it('places the subsolar point (l₀, b₀)', () => {
      const { subSolar } = disc();
      expect(subSolar.lon).toBeWithinAngle(fixture.subSolar.lon, TOLERANCE.libration);
      expect(subSolar.lat).toBeWithinAngle(fixture.subSolar.lat, TOLERANCE.libration);
    });

    it('tilts the axis (P)', () => {
      expect(disc().axisPositionAngle).toBeWithinAngle(fixture.axisPositionAngle, TOLERANCE.axisPositionAngle);
    });

    it('turns the bright limb (χ)', () => {
      const error = angleDiff(disc().brightLimbPositionAngle, fixture.brightLimbPositionAngle);
      expect(limbArc(error, fixture.phaseAngle)).toBeLessThan(TOLERANCE.brightLimbArc);
    });

    it('lights the disc (i, k)', () => {
      const { phaseAngle, illuminatedFraction } = disc();
      expect(phaseAngle).toBeWithinAngle(fixture.phaseAngle, TOLERANCE.phaseAngle);
      expect(illuminatedFraction).toBeNear(fixture.illuminatedFraction, TOLERANCE.illuminatedFraction);
    });

    it('sizes the disc', () => {
      const { distanceKm, angularDiameterArcmin } = disc();
      expect(distanceKm).toBeNear(fixture.distanceKm, TOLERANCE.distanceKm);
      expect(angularDiameterArcmin).toBeNear(fixture.angularDiameterArcmin, TOLERANCE.angularDiameterArcmin);
    });
  });
});

/**
 * Meeus 48.5: χ from the apparent RA/Dec of the Moon and the Sun, an
 * independent route to what `moonDisc` derives from the subsolar point and P.
 */
function meeusBrightLimb(instant: Temporal.Instant): number {
  const jde = DateToJDE(new Date(instant.epochMilliseconds));
  const { lon, lat } = position(jde);
  const [Δψ, Δε] = nutation(jde);
  const moon = new Ecliptic(lon + Δψ, lat).toEquatorial(meanObliquity(jde) + Δε);
  const sun = apparentEquatorialVSOP87(new Planet(vsop87Bearth), jde);
  return limb(new Coord(moon.ra, moon.dec), sun) / DEG;
}

describe('moonDisc bright limb vs Meeus 48.5', () => {
  // Both routes share Meeus's Moon and Sun, so they agree to ≤ 0.003° of arc,
  // closer than either agrees with Horizons. A flipped longitude, a mirrored axis or
  // a misplaced P would put them apart by tens of degrees.
  it.each(moonDiscFixtures)('agrees for $description at $instant', ({ instant }) => {
    const at = Temporal.Instant.from(instant);
    const disc = moonDisc(at);
    const error = angleDiff(disc.brightLimbPositionAngle, meeusBrightLimb(at));
    expect(limbArc(error, disc.phaseAngle)).toBeLessThan(0.005);
  });
});

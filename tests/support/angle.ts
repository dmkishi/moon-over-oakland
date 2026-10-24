/**
 * Angle arithmetic for the tests.
 *
 * `angleDiff` is the same formula as `wrapDeg180` in
 * `scripts/nasaJplHorizons/angles.ts`, written again on purpose: those scripts
 * generate the fixtures the `src/` tests check against, so the two share no
 * code.
 */

/** Radians per degree. */
export const DEG = Math.PI / 180;

/**
 * Signed difference between two angles in degrees, −180° to 180°.
 * @pure
 */
export function angleDiff(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

/**
 * An error in the bright limb's position angle χ, as degrees of arc on the
 * disc. χ is the direction of the subsolar point's offset from the disc center,
 * an offset that shrinks as sin(i) toward full and new, so the same arc there
 * is a much larger angle.
 * @pure
 */
export function limbArc(errorDeg: number, phaseAngleDeg: number): number {
  return Math.abs(errorDeg) * Math.sin(phaseAngleDeg * DEG);
}

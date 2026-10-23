const DEG = Math.PI / 180;

/**
 * Wrap an angle to `[0, 360)`.
 */
export function wrapDeg360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Wrap an angle to `[-180, 180)`.
 */
export function wrapDeg180(deg: number): number {
  return wrapDeg360(deg + 180) - 180;
}

/**
 * Compute the hour angle from LST and RA.
 *
 * @param lstHours - Local apparent sidereal time in decimal hours
 * @param raDeg - Right ascension
 * @returns Hour angle in degrees (positive west)
 */
function computeHourAngleDeg(lstHours: number, raDeg: number): number {
  const lstDeg = lstHours * 15;
  return wrapDeg180(lstDeg - raDeg);
}

/**
 * Compute the parallactic angle at a celestial body.
 *
 * Here, the parallactic angle is the angle at the Moon between the great-circle
 * arcs toward the celestial pole and toward the zenith, measured north through
 * east.
 */
function computeParallacticAngle(
  hourAngleDeg: number, // Positive west of meridian
  decDeg: number, // Declination
  observerLat: number,
): number {
  const h = hourAngleDeg * DEG;
  const d = decDeg * DEG;
  const p = observerLat * DEG;
  const q = Math.atan2(
    Math.sin(h),
    Math.tan(p) * Math.cos(d) - Math.sin(d) * Math.cos(h),
  );
  return q / DEG;
}

/**
 * Apparent RA/Dec in degrees, keyed as the Horizons columns are named.
 */
type ApparentEquatorial = Record<'apparentRightAscensionDeg' | 'apparentDeclinationDeg', number>;

/**
 * Position angle of the bright limb (Meeus 48.5), 0–360°, from the apparent
 * RA/Dec of the Moon and the Sun.
 */
export function brightLimbPositionAngle(
  moon: ApparentEquatorial,
  sun: ApparentEquatorial,
): number {
  const [α, δ] = [moon.apparentRightAscensionDeg * DEG, moon.apparentDeclinationDeg * DEG];
  const [α0, δ0] = [sun.apparentRightAscensionDeg * DEG, sun.apparentDeclinationDeg * DEG];
  const χ = Math.atan2(
    Math.cos(δ0) * Math.sin(α0 - α),
    Math.sin(δ0) * Math.cos(δ) - Math.cos(δ0) * Math.sin(δ) * Math.cos(α0 - α),
  ) / DEG;
  return wrapDeg360(χ);
}

/**
 * Compute the tilt of the Moon's bright limb relative to the local vertical.
 *
 * Everything is on the true equator and equinox of date, the frame local
 * apparent sidereal time is measured in. ICRF RA/Dec would put the hour angle
 * off by the precession in RA since J2000 (~0.36° by 2026), which the
 * parallactic angle amplifies into ~2° of tilt when the Moon passes ~10° from
 * the zenith.
 *
 * @param lstHours - Local apparent sidereal time in decimal hours
 */
export function moonTilt(
  lstHours: number,
  moon: ApparentEquatorial,
  sun: ApparentEquatorial,
  observerLat: number,
): number {
  const hourAngleDeg = computeHourAngleDeg(lstHours, moon.apparentRightAscensionDeg);
  const parallacticAngleDeg = computeParallacticAngle(
    hourAngleDeg,
    moon.apparentDeclinationDeg,
    observerLat,
  );
  return wrapDeg180(brightLimbPositionAngle(moon, sun) - parallacticAngleDeg);
}

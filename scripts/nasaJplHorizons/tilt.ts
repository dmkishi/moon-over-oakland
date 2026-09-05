const DEG = Math.PI / 180;

/**
 * Compute the hour angle from LST and RA.
 *
 * @param lstHours - Local apparent sidereal time in decimal hours
 * @param raDeg - Right ascension
 * @returns Hour angle in degrees (positive west)
 */
function computeHourAngleDeg(lstHours: number, raDeg: number): number {
  const lstDeg = lstHours * 15;
  let hourAngleDeg = lstDeg - raDeg;
  // Normalize to [-180, +180]
  while (hourAngleDeg > 180) hourAngleDeg -= 360;
  while (hourAngleDeg < -180) hourAngleDeg += 360;
  return hourAngleDeg;
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
 * Compute the tilt of the Moon's bright limb relative to the local vertical.
 */
// oxlint-disable-next-line max-params
export function moonTilt(
  lstHours: number, // Local apparent sidereal time in decimal hours
  raDeg: number, // Right ascension
  decDeg: number, // Declination
  observerLat: number,
  paSunDeg: number, // Position angle of the Sun (anti-sun/dark-limb direction)
): number {
  const hourAngleDeg = computeHourAngleDeg(lstHours, raDeg);
  const parallacticAngleDeg = computeParallacticAngle(hourAngleDeg, decDeg, observerLat);
  let tiltDeg = (paSunDeg + 180) - parallacticAngleDeg;
  while (tiltDeg > 180) tiltDeg -= 360;
  while (tiltDeg < -180) tiltDeg += 360;
  return tiltDeg;
}

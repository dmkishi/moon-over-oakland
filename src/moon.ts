import { DateTime } from 'luxon';
import SunCalc from 'suncalc';

export type MoonPhase =
  | 'new'
  | 'waxing-crescent'
  | 'first-quarter'
  | 'waxing-gibbous'
  | 'full'
  | 'waning-gibbous'
  | 'third-quarter'
  | 'waning-crescent';

interface MoonEvent {
  date: Date;
  azimuthDeg: number;
}

export interface MoonData {
  phaseName: MoonPhase;
  phase: number;          // 0-1, where 0 and 1 are new moon
  illumination: number;   // 0-100
  age: number;            // 0-29.5 days into lunar cycle
  distanceKm: number;
  moonrise: MoonEvent;
  moonset: MoonEvent;
  nextNewMoon: Date;
  nextFullMoon: Date;
}

const LUNAR_CYCLE_DAYS = 29.530589;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Convert phase value (0-1) to named phase
 */
function phaseValueToName(phase: number): MoonPhase {
  // Phase values from suncalc:
  // 0.00 = new moon
  // 0.25 = first quarter
  // 0.50 = full moon
  // 0.75 = third quarter
  // 1.00 = new moon (cycle complete)
  if (phase < 0.025 || phase >= 0.975) return 'new';
  if (phase < 0.225) return 'waxing-crescent';
  if (phase < 0.275) return 'first-quarter';
  if (phase < 0.475) return 'waxing-gibbous';
  if (phase < 0.525) return 'full';
  if (phase < 0.725) return 'waning-gibbous';
  if (phase < 0.775) return 'third-quarter';
  return 'waning-crescent';
}

function calculateMoonEvent(
  date: Date,
  latitude: number,
  longitude: number
): MoonEvent {
  return {
    date,
    azimuthDeg:
      SunCalc.getMoonPosition(date, latitude, longitude).azimuth * RAD_TO_DEG,
  };
}

export function calculateMoonData(
  date: Date,
  timezone: string,
  latitude: number,
  longitude: number
): MoonData {
  // Use noon local-time for consistent phase calculation
  const localNoon: Date = DateTime
    .fromJSDate(date)
    .setZone(timezone)
    .set({ hour: 12, minute: 0, second: 0, millisecond: 0 })
    .toJSDate();

  const illumination = SunCalc.getMoonIllumination(localNoon);
  const position = SunCalc.getMoonPosition(localNoon, latitude, longitude);
  const { rise, set } = SunCalc.getMoonTimes(localNoon, latitude, longitude);
  const age = Math.round(illumination.phase * LUNAR_CYCLE_DAYS * 100) / 100;
  const daysUntilNew = (1 - illumination.phase) * LUNAR_CYCLE_DAYS;
  const daysUntilFull = illumination.phase < 0.5
    ? (0.5 - illumination.phase) * LUNAR_CYCLE_DAYS
    : (1.5 - illumination.phase) * LUNAR_CYCLE_DAYS;

  return {
    phaseName: phaseValueToName(illumination.phase),
    phase: illumination.phase,
    illumination: Math.round(illumination.fraction * 100 * 10) / 10,
    age,
    distanceKm: Math.round(position.distance),
    moonrise: calculateMoonEvent(rise, latitude, longitude),
    moonset: calculateMoonEvent(set, latitude, longitude),
    nextNewMoon: new Date(localNoon.getTime() + daysUntilNew * MS_PER_DAY),
    nextFullMoon: new Date(localNoon.getTime() + daysUntilFull * MS_PER_DAY),
  };
}

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

export interface MoonData {
  phase: MoonPhase;
  illumination: number;   // 0-100
  age: number;            // 0-29.5 days into lunar cycle
  distance: number;       // km from Earth
  moonrise: Date | null;  // null if moon doesn't rise that day
  moonset: Date | null;   // null if moon doesn't set that day
  nextNewMoon: Date;
  nextFullMoon: Date;
}

const LUNAR_CYCLE_DAYS = 29.530589;

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

/**
 * Get the local midnight Date for a given timezone
 */
function getLocalMidnight(date: Date, timezone: string): Date {
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: timezone });
  const [year, month, day] = dateStr.split('-').map(Number);

  // Create a date at midnight UTC, then adjust
  const midnight = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return midnight;
}

/**
 * Calculate moon data for a given date and location
 */
export function calculateMoonData(
  date: Date,
  timezone: string,
  latitude: number,
  longitude: number
): MoonData {
  // Use noon local time for consistent phase calculation
  const referenceTime = getLocalMidnight(date, timezone);

  const illumination = SunCalc.getMoonIllumination(referenceTime);
  const position = SunCalc.getMoonPosition(referenceTime, latitude, longitude);
  const times = SunCalc.getMoonTimes(referenceTime, latitude, longitude);
  const age = Math.round(illumination.phase * LUNAR_CYCLE_DAYS * 100) / 100;

  return {
    phase: phaseValueToName(illumination.phase),
    illumination: Math.round(illumination.fraction * 100 * 10) / 10,
    age,
    distance: Math.round(position.distance),
    moonrise: times.rise ?? null,
    moonset: times.set ?? null,
  };
}

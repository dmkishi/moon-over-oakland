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

export type CompassDirection =
  | 'N' | 'NNE' | 'NE' | 'ENE' | 'E' | 'ESE' | 'SE' | 'SSE'
  | 'S' | 'SSW' | 'SW' | 'WSW' | 'W' | 'WNW' | 'NW' | 'NNW';

/**
 * `compassDeg` is used to explicitly distinguish from SunCalc's `azimuth`,
 * which uses a non-standard convention: 0° at south, increasing westward.
 */
export interface CelestialEvent {
  date: Date;
  compassDeg: number;
  compassDirection: CompassDirection;
}

export interface MoonData {
  phaseName: MoonPhase;
  phase: number;          // 0-1, where 0 and 1 are new moon
  illumination: number;   // 0-100
  age: number;            // 0-29.5 days into lunar cycle
  distanceKm: number;
  moonrise: CelestialEvent;
  moonset: CelestialEvent;
  sunrise: CelestialEvent;
  sunset: CelestialEvent;
  nextNewMoon: Date;
  nextFullMoon: Date;
}

const LUNAR_CYCLE_DAYS = 29.530589;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RAD_TO_DEG = 180 / Math.PI;
const COMPASS_DIRECTIONS: CompassDirection[] = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

function phaseValueToName(phase: number): MoonPhase {
  if (phase < 0.025 || phase >= 0.975) return 'new';
  if (phase < 0.225) return 'waxing-crescent';
  if (phase < 0.275) return 'first-quarter';
  if (phase < 0.475) return 'waxing-gibbous';
  if (phase < 0.525) return 'full';
  if (phase < 0.725) return 'waning-gibbous';
  if (phase < 0.775) return 'third-quarter';
  return 'waning-crescent';
}

function calculateCelestialEvent(
  date: Date,
  latitude: number,
  longitude: number,
  getPosition: (date: Date, lat: number, lng: number) => { azimuth: number },
): CelestialEvent {
  const azimuthDeg = getPosition(date, latitude, longitude).azimuth * RAD_TO_DEG;
  const compassDeg = (azimuthDeg + 180 + 360) % 360;
  const compassDirection = COMPASS_DIRECTIONS[Math.round(compassDeg / 22.5) % 16];
  return {
    date,
    compassDeg,
    compassDirection,
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

  const { phase, fraction: illumination } = SunCalc.getMoonIllumination(localNoon);
  const { distance } = SunCalc.getMoonPosition(localNoon, latitude, longitude);
  const { rise, set } = SunCalc.getMoonTimes(localNoon, latitude, longitude);
  const { sunrise, sunset } = SunCalc.getTimes(localNoon, latitude, longitude);
  const age = Math.round(phase * LUNAR_CYCLE_DAYS * 100) / 100;
  const daysUntilNew = (1 - phase) * LUNAR_CYCLE_DAYS;
  const daysUntilFull = phase < 0.5
    ? (0.5 - phase) * LUNAR_CYCLE_DAYS
    : (1.5 - phase) * LUNAR_CYCLE_DAYS;

  return {
    phaseName: phaseValueToName(phase),
    phase,
    illumination: Math.round(illumination * 100 * 10) / 10,
    age,
    distanceKm: Math.round(distance),
    moonrise: calculateCelestialEvent(rise, latitude, longitude, SunCalc.getMoonPosition),
    moonset: calculateCelestialEvent(set, latitude, longitude, SunCalc.getMoonPosition),
    sunrise: calculateCelestialEvent(sunrise, latitude, longitude, SunCalc.getPosition),
    sunset: calculateCelestialEvent(sunset, latitude, longitude, SunCalc.getPosition),
    nextNewMoon: new Date(localNoon.getTime() + daysUntilNew * MS_PER_DAY),
    nextFullMoon: new Date(localNoon.getTime() + daysUntilFull * MS_PER_DAY),
  };
}

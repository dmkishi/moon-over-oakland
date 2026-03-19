import { Temporal } from '@js-temporal/polyfill';
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

type CompassDirection =
  | 'N' | 'NNE' | 'NE' | 'ENE' | 'E' | 'ESE' | 'SE' | 'SSE'
  | 'S' | 'SSW' | 'SW' | 'WSW' | 'W' | 'WNW' | 'NW' | 'NNW';

/**
 * `compassDeg` is used to explicitly distinguish from SunCalc's `azimuth`,
 * which uses a non-standard convention: 0° at south, increasing westward.
 */
interface CelestialEvent {
  date: Date;
  compassDeg: number;
  compassDirection: CompassDirection;
}

interface MoonEvent extends CelestialEvent {
  tiltDeg: number;
}

/**
 * Snapshot of lunar attributes calculated at 12-noon in Oakland for a given
 * calendar day, i.e. its midpoint of the day. This provides an "average"
 * reading for that calendar day.
 */
interface MoonMidpoint {
  phaseName: MoonPhase;
  phase: number;        // 0-1: 0 and 1 = new moon, 0.5 = full moon
  illumination: number; // 0-1: 0 = new moon, 1 = full moon
  age: number;          // 0-29.5 days into lunar cycle
  distanceKm: number;
}

export interface MoonDay {
  day: Date;
  average: MoonMidpoint;
  moonrise: MoonEvent;
  moonset: MoonEvent;
  upperCulmination: Date;
  lowerCulmination: Date;
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

function celestialEvent(
  day: Date,
  latitude: number,
  longitude: number,
  getPosition: (date: Date, lat: number, lng: number) => { azimuth: number },
): CelestialEvent {
  const azimuthDeg = getPosition(day, latitude, longitude).azimuth * RAD_TO_DEG;
  const compassDeg = (azimuthDeg + 180 + 360) % 360;
  const compassDirection = COMPASS_DIRECTIONS[Math.round(compassDeg / 22.5) % 16];
  return {
    date: day,
    compassDeg,
    compassDirection,
  };
}

function moonEvent(
  day: Date,
  latitude: number,
  longitude: number,
): MoonEvent {
  const { angle } = SunCalc.getMoonIllumination(day);
  const { parallacticAngle } = SunCalc.getMoonPosition(day, latitude, longitude);
  const tiltDeg = (angle - parallacticAngle) * RAD_TO_DEG;
  return {
    ...celestialEvent(day, latitude, longitude, SunCalc.getMoonPosition),
    tiltDeg,
  };
}

export function calculateMoonDay(
  day: Date,
  timezone: string,
  latitude: number,
  longitude: number
): MoonDay {
  const localNoon: Date = new Date(
    Temporal.Instant
      .fromEpochMilliseconds(day.getTime())
      .toZonedDateTimeISO(timezone)
      .with({ hour: 12, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 })
      .toInstant()
      .epochMilliseconds
  );

  // `getMoonTimes()` returns undefined when the moonrise or moonset time
  //  straddles midnight; fall back to the previous day's moonrise or moonset
  // time to get a complete pair.
  const moonTimes = SunCalc.getMoonTimes(localNoon, latitude, longitude);
  const rise = moonTimes.rise
    ?? SunCalc.getMoonTimes(new Date(localNoon.getTime() - MS_PER_DAY), latitude, longitude).rise;
  const set = moonTimes.set
    ?? SunCalc.getMoonTimes(new Date(localNoon.getTime() + MS_PER_DAY), latitude, longitude).set;

  // When the moonset precedes moonrise (e.g. full moon: set=7 AM, rise=6 PM),
  // they belong to different transits. Use the next morning's set to pair
  // with the evening rise for the correct visible-arc midpoint.
  let transitSetMs = set.getTime();
  if (transitSetMs < rise.getTime()) {
    const nextSet = SunCalc.getMoonTimes(
      new Date(localNoon.getTime() + MS_PER_DAY), latitude, longitude
    ).set;
    if (nextSet) transitSetMs = nextSet.getTime();
  }
  const upperCulmination = new Date((rise.getTime() + transitSetMs) / 2);
  const lowerCulmination = new Date(upperCulmination.getTime() + 12 * 3_600_000);

  const { phase, fraction: illumination } = SunCalc.getMoonIllumination(localNoon);
  const { distance } = SunCalc.getMoonPosition(localNoon, latitude, longitude);
  const { sunrise, sunset } = SunCalc.getTimes(localNoon, latitude, longitude);
  const age = Math.round(phase * LUNAR_CYCLE_DAYS * 100) / 100;
  const daysUntilNew = (1 - phase) * LUNAR_CYCLE_DAYS;
  const daysUntilFull = phase < 0.5
    ? (0.5 - phase) * LUNAR_CYCLE_DAYS
    : (1.5 - phase) * LUNAR_CYCLE_DAYS;

  return {
    day: day,
    average: {
      phaseName: phaseValueToName(phase),
      phase,
      illumination,
      age,
      distanceKm: Math.round(distance),
    },
    moonrise: moonEvent(rise, latitude, longitude),
    moonset: moonEvent(set, latitude, longitude),
    upperCulmination,
    lowerCulmination,
    sunrise: celestialEvent(sunrise, latitude, longitude, SunCalc.getPosition),
    sunset: celestialEvent(sunset, latitude, longitude, SunCalc.getPosition),
    nextNewMoon: new Date(localNoon.getTime() + daysUntilNew * MS_PER_DAY),
    nextFullMoon: new Date(localNoon.getTime() + daysUntilFull * MS_PER_DAY),
  };
}

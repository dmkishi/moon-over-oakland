import { Temporal } from '@js-temporal/polyfill';
import SunCalc from 'suncalc';

/* Types ==================================================================== */
export type MoonPhase =
  | 'new'
  | 'waxing-crescent'
  | 'first-quarter'
  | 'waxing-gibbous'
  | 'full'
  | 'waning-gibbous'
  | 'third-quarter'
  | 'waning-crescent';

type PostingPhase = Extract<MoonPhase, 'new' | 'first-quarter' | 'full' | 'third-quarter'>;

type CompassDirection =
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

export interface MoonEvent extends CelestialEvent {
  tiltDeg: number;
}

interface PhaseEvents {
  newMoon: Date;
  firstQuarter: Date;
  fullMoon: Date;
  lastQuarter: Date;
}

export interface MoonPost {
  day: Date;
  doPost: boolean;
  phase: MoonPhase;
  eventTime?: Date;
  average: {
    illumination: number;
    age: number;
    distanceKm: number;
  };
  moonRise: MoonEvent;
  moonSet: MoonEvent;
  sunrise: CelestialEvent;
  sunset: CelestialEvent;
  nextEvents: PhaseEvents;
  nextPosts: PhaseEvents;
}

/* Constants ================================================================ */
const LUNAR_CYCLE_DAYS = 29.530589 as const;
const MS_PER_HOUR = 3_600_000 as const;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const RAD_TO_DEG = 180 / Math.PI;
const BINARY_SEARCH_ITERATIONS = 50;
const PROXIMITY_THRESHOLD = .05;
const COMPASS_DIRECTIONS: CompassDirection[] = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];
const PHASE_TARGETS: { target: number; key: keyof PhaseEvents; phase: PostingPhase }[] = [
  { target: 0,    key: 'newMoon',      phase: 'new' },
  { target: 0.25, key: 'firstQuarter', phase: 'first-quarter' },
  { target: 0.5,  key: 'fullMoon',     phase: 'full' },
  { target: 0.75, key: 'lastQuarter',  phase: 'third-quarter' },
];

export function calculateMoonPost(
  day: Date,
  timezone: string,
  latitude: number,
  longitude: number,
): MoonPost {
  const noon = toLocalNoon(day, timezone);

  // `getMoonTimes()` returns undefined when the moonrise or moonset time
  // straddles midnight; fall back to adjacent days to get a complete pair. Rise
  // falls back to the previous day first, set to the next day first.
  const moonTimes = SunCalc.getMoonTimes(noon, latitude, longitude);
  const rise = moonTimes.rise
    ?? SunCalc.getMoonTimes(new Date(noon.getTime() - MS_PER_DAY), latitude, longitude).rise
    ?? SunCalc.getMoonTimes(new Date(noon.getTime() + MS_PER_DAY), latitude, longitude).rise;
  const set = moonTimes.set
    ?? SunCalc.getMoonTimes(new Date(noon.getTime() + MS_PER_DAY), latitude, longitude).set
    ?? SunCalc.getMoonTimes(new Date(noon.getTime() - MS_PER_DAY), latitude, longitude).set;

  // Noon snapshot
  const { phase: phaseValue, fraction: illumination } = SunCalc.getMoonIllumination(noon);
  const { distance } = SunCalc.getMoonPosition(noon, latitude, longitude);
  const { sunrise, sunset } = SunCalc.getTimes(noon, latitude, longitude);
  const age = Math.round(phaseValue * LUNAR_CYCLE_DAYS * 100) / 100;

  // Posting decision
  const decision = evaluatePosting(day, timezone, latitude, longitude);

  // Dates of future events and posts
  const nextEvents = findAllNextEvents(day, timezone);
  const nextPosts = findAllNextPosts(day, timezone, latitude, longitude, nextEvents);

  return {
    day,
    doPost: decision.doPost,
    phase: phaseValueToName(phaseValue),
    eventTime: decision.eventTime,
    average: {
      illumination,
      age,
      distanceKm: Math.round(distance),
    },
    moonRise: moonEvent(rise, latitude, longitude),
    moonSet: moonEvent(set, latitude, longitude),
    sunrise: celestialEvent(sunrise, latitude, longitude, SunCalc.getPosition),
    sunset: celestialEvent(sunset, latitude, longitude, SunCalc.getPosition),
    nextEvents,
    nextPosts,
  };
}

/* Phase Helpers ============================================================ */
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

function adjustedPhase(phase: number, target: number): number {
  let diff = phase - target;
  if (diff > 0.5) diff -= 1;
  if (diff < -0.5) diff += 1;
  return diff;
}

/* Celestial and Temporal Helpers =========================================== */
function celestialEvent(
  day: Date,
  latitude: number,
  longitude: number,
  getPosition: (date: Date, lat: number, lng: number) => { azimuth: number },
): CelestialEvent {
  const azimuthDeg = getPosition(day, latitude, longitude).azimuth * RAD_TO_DEG;
  const compassDeg = (azimuthDeg + 180 + 360) % 360;
  const compassDirection = COMPASS_DIRECTIONS[Math.round(compassDeg / 22.5) % 16];
  return { date: day, compassDeg, compassDirection };
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

/* Temporal Helpers ========================================================= */
function toLocalNoon(date: Date, timezone: string): Date {
  return new Date(
    Temporal.Instant
      .fromEpochMilliseconds(date.getTime())
      .toZonedDateTimeISO(timezone)
      .with({ hour: 12, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 })
      .toInstant()
      .epochMilliseconds
  );
}

/**
 * Compute the start of day (i.e. midnight) for a given date in a timezone.
 */
function toLocalMidnight(date: Date, timezone: string): Date {
  return new Date(
    Temporal.Instant
      .fromEpochMilliseconds(date.getTime())
      .toZonedDateTimeISO(timezone)
      .with({ hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 })
      .toInstant()
      .epochMilliseconds
  );
}


/**
 * Convert absolute date to the local calendar date string (YYYY-MM-DD) in the
 * given timezone.
 */
function calendarDate(date: Date, timezone: string): string {
  return Temporal.Instant
    .fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .toString();
}

/**
 * Extract the fractional hour (0-24) for a Date in the given timezone.
 */
function localHour(date: Date, timezone: string): number {
  const zdt = Temporal.Instant
    .fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(timezone);
  return zdt.hour + zdt.minute / 60 + zdt.second / 3_600;
}

function dateStringToDate(dateStr: string, timezone: string): Date {
  return new Date(
    Temporal.PlainDate.from(dateStr)
      .toZonedDateTime(timezone)
      .toInstant()
      .epochMilliseconds
  );
}

function offsetDate(dateStr: string, days: number): string {
  return Temporal.PlainDate.from(dateStr).add({ days }).toString();
}

/* Posting Rules ============================================================ */
/**
 * Evaluate whether a moon phase post should be published on the given date.
 */
function evaluatePosting(
  date: Date,
  timezone: string,
  latitude: number,
  longitude: number,
): { doPost: boolean; phase?: PostingPhase; eventTime?: Date } {
  const phaseAtNoon = SunCalc.getMoonIllumination(toLocalNoon(date, timezone)).phase;
  const midnight = toLocalMidnight(date, timezone);
  const searchStartMs = midnight.getTime() - 12 * MS_PER_HOUR;
  const searchEndMs = midnight.getTime() + 36 * MS_PER_HOUR;
  const inputDate = calendarDate(date, timezone);

  // Scans a window from 12h before midnight through 36h after for nearby phase
  // events, finds the exact event time via binary search, applies the date-
  // assignment algorithm, and returns whether the assigned date matches the input
  // date.
  for (const { target, phase } of PHASE_TARGETS) {
    const distance = Math.abs(adjustedPhase(phaseAtNoon, target));
    if (distance > PROXIMITY_THRESHOLD) continue;

    const eventTime = binarySearchPhaseEvent(target, searchStartMs, searchEndMs);
    if (!eventTime) continue;

    const assigned = assignPostingDate(phase, eventTime, timezone, latitude, longitude);
    if (assigned === inputDate) {
      return {
        doPost: true,
        phase,
        eventTime,
      };
    }
  }

  return {
    doPost: false,
  };
}

/* Binary Search for Events ================================================= */
function binarySearchPhaseEvent(
  target: number,
  startMs: number,
  endMs: number,
): Date | null {
  let lo = startMs;
  let hi = endMs;

  const loAdj = adjustedPhase(SunCalc.getMoonIllumination(new Date(lo)).phase, target);
  const hiAdj = adjustedPhase(SunCalc.getMoonIllumination(new Date(hi)).phase, target);

  if (loAdj * hiAdj > 0) return null;

  for (let i = 0; i < BINARY_SEARCH_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const midAdj = adjustedPhase(SunCalc.getMoonIllumination(new Date(mid)).phase, target);
    if (midAdj * loAdj <= 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return new Date((lo + hi) / 2);
}

/* Date Assignment ========================================================== */
function assignPostingDate(
  phase: PostingPhase,
  eventTime: Date,
  timezone: string,
  latitude: number,
  longitude: number,
): string {
  const eventDate = calendarDate(eventTime, timezone);

  if (phase === 'new' || phase === 'first-quarter') {
    return eventDate;
  }

  // Need culmination and moonset data for full/third-quarter assignment
  const noon = toLocalNoon(eventTime, timezone);
  const moonTimes = SunCalc.getMoonTimes(noon, latitude, longitude);
  const rise = moonTimes.rise
    ?? SunCalc.getMoonTimes(new Date(noon.getTime() - MS_PER_DAY), latitude, longitude).rise;
  const set = moonTimes.set
    ?? SunCalc.getMoonTimes(new Date(noon.getTime() + MS_PER_DAY), latitude, longitude).set;

  let transitSetMs = set.getTime();
  if (transitSetMs < rise.getTime()) {
    const nextSet = SunCalc.getMoonTimes(
      new Date(noon.getTime() + MS_PER_DAY), latitude, longitude
    ).set;
    if (nextSet) transitSetMs = nextSet.getTime();
  }

  const upperCulmination = new Date((rise.getTime() + transitSetMs) / 2);
  const lowerCulmination = new Date(upperCulmination.getTime() + 12 * MS_PER_HOUR);
  const eventH = localHour(eventTime, timezone);

  if (phase === 'full') {
    const oKH = localHour(upperCulmination, timezone);
    const setH = localHour(new Date(transitSetMs), timezone);
    const qH = (oKH + setH) / 2;
    return eventH < qH ? offsetDate(eventDate, -1) : eventDate;
  }

  // Third-quarter: post on next day if event time >= lower culmination
  const uKH = localHour(lowerCulmination, timezone);
  return eventH < uKH ? eventDate : offsetDate(eventDate, 1);
}

/* Find Next Event ===========================================================*/
function findNextPhaseEvent(
  target: number,
  afterDate: Date,
  timezone: string,
): Date {
  const noon = toLocalNoon(afterDate, timezone);
  const currentPhase = SunCalc.getMoonIllumination(noon).phase;
  const afterCalDate = calendarDate(afterDate, timezone);

  let daysUntil = ((target - currentPhase + 1) % 1) * LUNAR_CYCLE_DAYS;
  if (daysUntil === 0) daysUntil = LUNAR_CYCLE_DAYS;

  const windowMs = 3 * MS_PER_DAY;
  const estimateMs = noon.getTime() + daysUntil * MS_PER_DAY;

  let event = binarySearchPhaseEvent(target, estimateMs - windowMs, estimateMs + windowMs);
  if (event && calendarDate(event, timezone) > afterCalDate) {
    return event;
  }

  // Try next cycle
  const nextEstimateMs = estimateMs + LUNAR_CYCLE_DAYS * MS_PER_DAY;
  event = binarySearchPhaseEvent(target, nextEstimateMs - windowMs, nextEstimateMs + windowMs);
  if (event && calendarDate(event, timezone) > afterCalDate) {
    return event;
  }

  throw new Error(`Could not find next phase event for target ${target}`);
}

function findAllNextEvents(day: Date, timezone: string): PhaseEvents {
  return {
    newMoon: findNextPhaseEvent(0, day, timezone),
    firstQuarter: findNextPhaseEvent(0.25, day, timezone),
    fullMoon: findNextPhaseEvent(0.5, day, timezone),
    lastQuarter: findNextPhaseEvent(0.75, day, timezone),
  };
}

function findAllNextPosts(
  day: Date,
  timezone: string,
  latitude: number,
  longitude: number,
  nextEvents: PhaseEvents,
): PhaseEvents {
  const afterCalDate = calendarDate(day, timezone);
  const result = {} as PhaseEvents;

  for (const { target, key, phase } of PHASE_TARGETS) {
    let event = nextEvents[key];
    let postDateStr = assignPostingDate(phase, event, timezone, latitude, longitude);

    while (postDateStr <= afterCalDate) {
      event = findNextPhaseEvent(target, event, timezone);
      postDateStr = assignPostingDate(phase, event, timezone, latitude, longitude);
    }

    result[key] = dateStringToDate(postDateStr, timezone);
  }

  return result;
}

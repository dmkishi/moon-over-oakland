import { Temporal } from '@js-temporal/polyfill';
import {
  calculateDayEvents,
  type DayEvents,
} from './ephemeris/day-events.ts';
import {
  findNextPhases,
  findPhaseNear,
  PHASE_TYPES,
  type PhaseType,
} from './ephemeris/phase.ts';
import {
  calculateEventDeltas,
  type EventDelta,
  type MoonEvent,
} from './event-delta.ts';

export interface PhaseEvent {
  phaseType: PhaseType;
  eventDay: 'today' | 'tomorrow';
  events: DayEvents & { phase: Temporal.ZonedDateTime };
  eventDeltas: Record<MoonEvent, EventDelta>;
  nextPhases: Record<PhaseType, Temporal.ZonedDateTime>;
}

/**
 * Given a plain date and observer properties, returns phase event if any occurs
 * within a window boundary, at or after 4:00 AM on the day of and before 4:00
 * AM the next day.
 */
export function calculatePhaseEvent(
  date: Temporal.PlainDate,
  timezone: string,
  latitude: number,
  longitude: number,
): PhaseEvent | null {
  // Calendar arithmetic, not +24h, keeps 23- and 25-hour DST days correct;
  // 04:00 exists unambiguously on every US transition day.
  const windowBoundary = { timeZone: timezone, plainTime: '04:00' };
  const windowStart = date.toZonedDateTime(windowBoundary);
  const windowEnd = date.add({ days: 1 }).toZonedDateTime(windowBoundary);

  // Find principal phase events from midpoint of window start and end.
  const windowMidpoint = (windowStart.epochMilliseconds + windowEnd.epochMilliseconds) / 2;

  for (const phaseType of PHASE_TYPES) {
    const phase = findPhaseNear(phaseType, windowMidpoint, timezone);
    if (
      Temporal.ZonedDateTime.compare(windowStart, phase) > 0 ||
      Temporal.ZonedDateTime.compare(phase, windowEnd) >= 0
    ) continue;

    const dayEvents = calculateDayEvents(date, timezone, latitude, longitude);

    return {
      phaseType,
      eventDay: phase.toPlainDate().equals(date) ? 'today' : 'tomorrow',
      events: {
        phase,
        ...dayEvents,
      },
      eventDeltas: calculateEventDeltas(dayEvents, phaseType),
      nextPhases: findNextPhases(windowEnd, timezone),
    };
  }

  return null;
}

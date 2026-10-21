/**
 * Renders a `PhaseEvent` into the plain text of a post.
 */
import type { PhaseEvent } from './phase-event.ts';
import { post, type PostData } from './post.ts';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * E.g. "9/18 (Thu)".
 * @pure
 */
function formatDate(zoned: Temporal.ZonedDateTime): string {
  return `${zoned.month}/${zoned.day} (${WEEKDAYS[zoned.dayOfWeek - 1]})`;
}

/**
 * E.g. "1:30 pm", "12-noon", "12-midnight".
 * @pure
 */
function formatTime(zoned: Temporal.ZonedDateTime): string {
  if (zoned.minute === 0 && zoned.hour === 0) return '12-midnight';
  if (zoned.minute === 0 && zoned.hour === 12) return '12-noon';
  const hour = zoned.hour % 12 || 12;
  const minute = String(zoned.minute).padStart(2, '0');
  return `${hour}:${minute} ${zoned.hour < 12 ? 'am' : 'pm'}`;
}

export function renderPost(phaseEvent: PhaseEvent, timezone: string): string {
  const local = (zoned: Temporal.ZonedDateTime) => zoned.withTimeZone(timezone);
  const { dayEvents, nextPhases } = phaseEvent;
  const data: PostData = {
    phaseType: phaseEvent.type,
    eventDay: phaseEvent.day,
    eventTime: formatTime(local(phaseEvent.time)),
    moonriseTime: formatTime(local(dayEvents.moonrise)),
    moonsetTime: formatTime(local(dayEvents.moonset)),
    sunriseTime: formatTime(local(dayEvents.sunrise)),
    sunsetTime: formatTime(local(dayEvents.sunset)),
    deltaRiseMinutes: phaseEvent.eventDeltas.moonrise.minutes,
    deltaSetMinutes: phaseEvent.eventDeltas.moonset.minutes,
    nextNewDate: formatDate(local(nextPhases['new'])),
    nextFirstQuarterDate: formatDate(local(nextPhases['first-quarter'])),
    nextFullDate: formatDate(local(nextPhases['full'])),
    nextLastQuarterDate: formatDate(local(nextPhases['last-quarter'])),
  };
  const trimmedResult = post(data).split('\n').map((line) => line.trim()).join('\n').trim();
  return trimmedResult;
}

/**
 * Renders a `PhaseEvent` into the plain text of a post.
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Temporal } from 'temporal-polyfill/implementation';
import { Liquid } from 'liquidjs';
import type { PhaseEvent } from './phase-event.ts';

function createEngine(timezone: string): Liquid {
  return new Liquid({
    root: dirname(fileURLToPath(import.meta.url)),
    extname: '.liquid',
    timezoneOffset: timezone,
  });
}

/**
 * @pure
 */
function toDate(zoned: Temporal.ZonedDateTime): Date {
  return new Date(zoned.epochMilliseconds);
}

export async function renderPost(phaseEvent: PhaseEvent, timezone: string): Promise<string> {
  const data = {
    phaseType: phaseEvent.type,
    eventDay: phaseEvent.day,
    eventTime: toDate(phaseEvent.time),
    moonrise: toDate(phaseEvent.dayEvents.moonrise),
    moonset: toDate(phaseEvent.dayEvents.moonset),
    sunrise: toDate(phaseEvent.dayEvents.sunrise),
    sunset: toDate(phaseEvent.dayEvents.sunset),
    deltaRiseMinutes: phaseEvent.eventDeltas.moonrise.minutes,
    deltaSetMinutes: phaseEvent.eventDeltas.moonset.minutes,
    nextNew: toDate(phaseEvent.nextPhases['new']),
    nextFirstQuarter: toDate(phaseEvent.nextPhases['first-quarter']),
    nextFull: toDate(phaseEvent.nextPhases['full']),
    nextLastQuarter: toDate(phaseEvent.nextPhases['last-quarter']),
  };
  const result: string = await createEngine(timezone).renderFile('post', data);
  const trimmedResult = result.split('\n').map((line) => line.trim()).join('\n').trim();
  return trimmedResult;
}

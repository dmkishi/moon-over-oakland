/**
 * Renders a `PhaseEvent` into the plain text of a post.
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Temporal } from '@js-temporal/polyfill';
import { Liquid } from 'liquidjs';
import type { PhaseEvent } from './phase-event.ts';

function createEngine(timezone: string): Liquid {
  return new Liquid({
    root: dirname(fileURLToPath(import.meta.url)),
    extname: '.liquid',
    timezoneOffset: timezone,
  });
}

function toDate(zoned: Temporal.ZonedDateTime): Date {
  return new Date(zoned.epochMilliseconds);
}

export async function renderPost(phaseEvent: PhaseEvent, timezone: string): Promise<string> {
  const data = {
    phaseType: phaseEvent.phaseType,
    eventDay: phaseEvent.eventDay,
    eventTime: toDate(phaseEvent.events.phase),
    moonrise: toDate(phaseEvent.events.moonrise),
    moonset: toDate(phaseEvent.events.moonset),
    sunrise: toDate(phaseEvent.events.sunrise),
    sunset: toDate(phaseEvent.events.sunset),
    deltaRiseMinutes: phaseEvent.eventDeltas.riseMinutes,
    deltaSetMinutes: phaseEvent.eventDeltas.setMinutes,
    nextNew: toDate(phaseEvent.nextPhases.new),
    nextFirstQuarter: toDate(phaseEvent.nextPhases.firstQuarter),
    nextFull: toDate(phaseEvent.nextPhases.full),
    nextLastQuarter: toDate(phaseEvent.nextPhases.lastQuarter),
  };
  const result: string = await createEngine(timezone).renderFile('post', data);
  const trimmedResult = result.split('\n').map((line) => line.trim()).join('\n').trim();
  return trimmedResult;
}

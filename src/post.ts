/**
 * Renders a `PhaseEvent` into the plain text of a post and the alt text of its
 * image.
 */
import type { PhaseEvent } from './phase-event.ts';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SHORT_MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const PHASE_NAMES: Record<PhaseEvent['type'], string> = {
  'new': 'New moon',
  'first-quarter': 'First quarter moon',
  'full': 'Full moon',
  'last-quarter': 'Last quarter moon',
};

interface Range { min: number; max?: number }
const NEAR = { min: 15, max: 45 } satisfies Range;
const FAR: Range = { min: NEAR.max };

/**
 * E.g. "9/18 (Thu)".
 * @pure
 */
function formatDate(zoned: Temporal.ZonedDateTime): string {
  return `${zoned.month}/${zoned.day} (${SHORT_WEEKDAYS[zoned.dayOfWeek - 1]})`;
}

/**
 * E.g. "Nov. 1, 2026 (Sunday)".
 * @pure
 */
function formatLongDate(zoned: Temporal.ZonedDateTime): string {
  return `${SHORT_MONTHS[zoned.month - 1]} ${zoned.day}, ${zoned.year} (${WEEKDAYS[zoned.dayOfWeek - 1]})`;
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

/**
 * @pure
 */
function isMinutesAway(minutes: number, { min, max = Infinity }: Range): boolean {
  const distance = Math.abs(minutes);
  return distance >= min && distance < max;
}

/**
 * Bluesky requires one, and it also carries the image's credit, which costs
 * the post no graphemes.
 * @pure
 */
export function renderAltText(
  phaseEvent: PhaseEvent,
  illuminatedFraction: number,
  timezone: string,
): string {
  const zoned = phaseEvent.time.withTimeZone(timezone);
  const percent = (illuminatedFraction * 100).toFixed(1);
  return `${PHASE_NAMES[phaseEvent.type]} (${percent}% illuminated) at ${formatTime(zoned)} on ${formatLongDate(zoned)}, celestial north up. Rendered from NASA SVS CGI Moon Kit.`;
}

export function renderPost(phaseEvent: PhaseEvent, timezone: string): string {
  return text(phaseEvent, timezone).split('\n').map((line) => line.trim()).join('\n').trim();
}

/**
 * Lines are indented to read as code. `renderPost()` trims every line.
 * @pure
 */
function text(phaseEvent: PhaseEvent, timezone: string): string {
  const date = (zoned: Temporal.ZonedDateTime) => formatDate(zoned.withTimeZone(timezone));
  const time = (zoned: Temporal.ZonedDateTime) => formatTime(zoned.withTimeZone(timezone));
  const { type, dayEvents, eventDeltas, nextPhases } = phaseEvent;

  switch (type) {
    case 'new':
      /* -----------------------------------------------------------------------
       * NEW
       * - MOONRISE around sunrise.
       * - MOONSET around sunset.
       */
      return `
        NEW MOON today. A new moon rises and sets with the sun, it will be in the sky all day but you won’t be able to see it.

        • Moonrise: ${time(dayEvents.moonrise)}
        • Moonset: ${time(dayEvents.moonset)}

        Next phases:
        • Half moon: ${date(nextPhases['first-quarter'])}
        • Full moon: ${date(nextPhases['full'])}
        • New moon: ${date(nextPhases['new'])}
      `;

    case 'first-quarter': {
      /* -----------------------------------------------------------------------
       * FIRST QUARTER
       * - MOONRISE around noon.
       * - MOONSET around midnight at end of day (notate if after midnight.)
       */
      const moonsetNote = eventDeltas.moonset.minutes > 0 ? '(after midnight)' : '';

      return `
        HALF MOON (FIRST QUARTER) today. A first quarter moon rises around noon and sets around midnight. It is highest in the sky around sunset.

        • Moonrise: ${time(dayEvents.moonrise)}
        • Moonset: ${time(dayEvents.moonset)} ${moonsetNote}

        Next phases:
        • Full moon: ${date(nextPhases['full'])}
        • Half moon: ${date(nextPhases['last-quarter'])}
        • New moon: ${date(nextPhases['new'])}
      `;
    }

    case 'full':
      /* -----------------------------------------------------------------------
       * FULL
       * - MOONRISE around sunset.
       * - MOONSET around sunrise (always the next morning.)
       */
      return `
        FULL MOON today. A full moon rises around sunset and sets around sunrise. It will be visible all night, given a clear sky.

        • Moonrise: ${time(dayEvents.moonrise)}
        • Moonset: ${time(dayEvents.moonset)} (tomorrow morning)

        Next phases:
        • Half moon: ${date(nextPhases['last-quarter'])}
        • New moon: ${date(nextPhases['new'])}
        • Full moon: ${date(nextPhases['full'])}
      `;

    case 'last-quarter': {
      /* -----------------------------------------------------------------------
       * LAST QUARTER
       * - MOONRISE around midnight at start of day (notate if before midnight.)
       * - MOONSET around noon.
       */
      const moonriseNote = eventDeltas.moonrise.minutes < 0 ? '(yesterday)' : '';
      return `
        HALF MOON (LAST QUARTER) today. A last quarter moon rises around midnight and sets around noon. It is highest in the sky around sunrise.

        • Moonrise: ${time(dayEvents.moonrise)} ${moonriseNote}
        • Moonset: ${time(dayEvents.moonset)}

        Next phases:
        • New moon: ${date(nextPhases['new'])}
        • Half moon: ${date(nextPhases['first-quarter'])}
        • Full moon: ${date(nextPhases['full'])}
      `;
    }

    default:
      throw new TypeError(`Unhandled phase type: ${String(type satisfies never)}`);
  }
}

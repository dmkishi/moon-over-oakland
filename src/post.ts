/**
 * Renders a `PhaseEvent` into the plain text of a post and the alt text of its
 * image.
 */
import type { PhaseEvent } from './phase-event.ts';

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

const PHASE_NAMES: Record<PhaseEvent['type'], string> = {
  'new': 'New moon',
  'first-quarter': 'First quarter moon',
  'full': 'Full moon',
  'last-quarter': 'Last quarter moon',
};

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
  const sentences = [
    `${PHASE_NAMES[phaseEvent.type]}, ${percent}% illuminated, as seen from Earth at ${formatTime(zoned)} on ${formatDate(zoned)}, celestial north up.`,
    'Rendered from NASA LRO data (NASA SVS CGI Moon Kit).',
  ];
  // At conjunction the Moon is lost in the Sun's glare, and real earthshine
  // is far too faint to show at this exposure.
  if (phaseEvent.type === 'new') sentences.push('Earthshine exaggerated.');
  return sentences.join(' ');
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
        🌑 The NEW MOON rises with the sun and sets with the sun. It’ll be in the sky all day, though you probably won’t be able to see it.

        • Moonrise: ${time(dayEvents.moonrise)}
        • Moonset: ${time(dayEvents.moonset)}

        Next phases:
        • Half Moon: ${date(nextPhases['first-quarter'])}
        • Full Moon: ${date(nextPhases['full'])}
        • New Moon: ${date(nextPhases['new'])}
      `;

    case 'first-quarter': {
      /* -----------------------------------------------------------------------
       * FIRST QUARTER
       * - MOONRISE around noon.
       * - MOONSET around midnight at end of day (notate if after midnight.)
       */
      const moonsetNote = eventDeltas.moonset.minutes > 0 ? '(after midnight)' : '';
      return `
        🌓 The HALF MOON (FIRST QUARTER) rises around noon and sets around midnight. It is visible in the afternoon and evening.

        • Moonrise: ${time(dayEvents.moonrise)}
        • Moonset: ${time(dayEvents.moonset)} ${moonsetNote}

        Next phases:
        • Full Moon: ${date(nextPhases['full'])}
        • Half Moon: ${date(nextPhases['last-quarter'])}
        • New Moon: ${date(nextPhases['new'])}
      `;
    }

    case 'full':
      /* -----------------------------------------------------------------------
       * FULL
       * - MOONRISE around sunset.
       * - MOONSET around sunrise (always the next morning.)
       */
      return `
        🌕 The FULL MOON rises around sunset and sets around sunrise. It’ll be visible all night, given a clear sky.

        • Moonrise: ${time(dayEvents.moonrise)}
        • Moonset: ${time(dayEvents.moonset)} (tomorrow morning)

        Next phases:
        • Half Moon: ${date(nextPhases['last-quarter'])}
        • New Moon: ${date(nextPhases['new'])}
        • Full Moon: ${date(nextPhases['full'])}
      `;

    case 'last-quarter': {
      /* -----------------------------------------------------------------------
       * LAST QUARTER
       * - MOONRISE around midnight at start of day (notate if before midnight.)
       * - MOONSET around noon.
       */
      const moonriseNote = eventDeltas.moonrise.minutes < 0 ? '(yesterday)' : '';
      return `
        🌗 The HALF MOON (LAST QUARTER) rises around midnight and sets around noon today. It is visible in the late night and morning.

        • Moonrise: ${time(dayEvents.moonrise)} ${moonriseNote}
        • Moonset: ${time(dayEvents.moonset)}

        Next phases:
        • New Moon: ${date(nextPhases['new'])}
        • Half Moon: ${date(nextPhases['first-quarter'])}
        • Full Moon: ${date(nextPhases['full'])}
      `;
    }

    default:
      throw new TypeError(`Unhandled phase type: ${String(type satisfies never)}`);
  }
}

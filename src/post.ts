/**
 * The text of a post, by phase.
 */
import type { PhaseType } from './ephemeris/phase.ts';
import type { PhaseEvent } from './phase-event.ts';

export interface PostData {
  phaseType: PhaseType;
  eventDay: PhaseEvent['day'];
  eventTime: string; // E.g. "1:30 pm", "12-noon", "12-midnight".
  moonriseTime: string; // Ditto
  moonsetTime: string; // Ditto
  sunriseTime: string; // Ditto
  sunsetTime: string; // Ditto
  deltaRiseMinutes: number;
  deltaSetMinutes: number;
  nextNewDate: string; // E.g. "9/18 (Thu)".
  nextFirstQuarterDate: string; // Ditto
  nextFullDate: string; // Ditto
  nextLastQuarterDate: string; // Ditto
}

/**
 * Lines are indented to read as code. `renderPost()` trims every line.
 * @pure
 */
export function post(data: PostData): string {
  switch (data.phaseType) {
    case 'new':
      // -----------------------------------------------------------------------
      // NEW
      // - MOONRISE around sunrise.
      // - MOONSET around sunset.
      return `
        🌑 The NEW MOON rises with the sun and sets with the sun. It’ll be in the sky all day, though you probably won’t be able to see it.

        • Moonrise: ${data.moonriseTime}
        • Moonset: ${data.moonsetTime}

        Next phases:
        • Half Moon: ${data.nextFirstQuarterDate}
        • Full Moon: ${data.nextFullDate}
        • New Moon: ${data.nextNewDate}
      `;

    case 'first-quarter': {
      // -----------------------------------------------------------------------
      // FIRST QUARTER
      // - MOONRISE around noon.
      // - MOONSET around midnight at end of day (notate if after midnight.)
      const moonsetNote = data.deltaSetMinutes > 0 ? '(after midnight)' : '';
      return `
        🌓 The HALF MOON (FIRST QUARTER) rises around noon and sets around midnight. It is visible in the afternoon and evening.

        • Moonrise: ${data.moonriseTime}
        • Moonset: ${data.moonsetTime} ${moonsetNote}

        Next phases:
        • Full Moon: ${data.nextFullDate}
        • Half Moon: ${data.nextLastQuarterDate}
        • New Moon: ${data.nextNewDate}
      `;
    }

    case 'full':
      // -----------------------------------------------------------------------
      // FULL
      // - MOONRISE around sunset.
      // - MOONSET around sunrise (always the next morning.)
      return `
        🌕 The FULL MOON rises around sunset and sets around sunrise. It’ll be visible all night, given a clear sky.

        • Moonrise: ${data.moonriseTime}
        • Moonset: ${data.moonsetTime} (tomorrow morning)

        Next phases:
        • Half Moon: ${data.nextLastQuarterDate}
        • New Moon: ${data.nextNewDate}
        • Full Moon: ${data.nextFullDate}
      `;

    case 'last-quarter': {
      // -----------------------------------------------------------------------
      // LAST QUARTER
      // - MOONRISE around midnight at start of day (notate if before midnight.)
      // - MOONSET around noon.
      const moonriseNote = data.deltaRiseMinutes < 0 ? '(yesterday)' : '';
      return `
        🌗 The HALF MOON (LAST QUARTER) rises around midnight and sets around noon today. It is visible in the late night and morning.

        • Moonrise: ${data.moonriseTime} ${moonriseNote}
        • Moonset: ${data.moonsetTime}

        Next phases:
        • New Moon: ${data.nextNewDate}
        • Half Moon: ${data.nextFirstQuarterDate}
        • Full Moon: ${data.nextFullDate}
      `;
    }

    default:
      throw new TypeError(`Unhandled phase type: ${String(data.phaseType satisfies never)}`);
  }
}

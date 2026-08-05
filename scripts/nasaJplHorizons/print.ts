import { Temporal } from '@js-temporal/polyfill';
import type { MoonEphemeris } from './ephemeris.ts';
import type { Observer, ObservingDay } from './observer.ts';
import type { PhaseEventName } from './phaseEvent.ts';
import type { MoonSummary } from './summary.ts';

/**
 * Formats an instant's local wall clock as 12-hour time, e.g. "7:30 PM".
 */
function formatTime12h(at: Temporal.ZonedDateTime): string {
  const h = at.hour % 12 || 12;
  const period = at.hour < 12 ? 'AM' : 'PM';
  return `${h}:${String(at.minute).padStart(2, '0')} ${period}`;
}

export function printTable(moonEphemeris: MoonEphemeris[]): void {
  console.log(
    'Datetime                 | Altº   | Azº    | Illum% | KM      | Tiltº',
  );
  console.log(
    '─────────────────────────┼────────┼────────┼────────┼─────────┼────────',
  );
  for (const row of moonEphemeris) {
    const datetimeStr = `${row.at.toPlainDateTime().toString({ smallestUnit: 'minute' }).replace('T', ' ')} ${row.flags.join('')}`.padEnd(25);
    const altitudeStr = row.altitudeDeg.toFixed(1).padStart(6);
    const azimuthStr = row.azimuthDeg.toFixed(1).padStart(6);
    const illuminationStr = row.illuminatedFraction.toFixed(3).padStart(6);
    const distanceStr = Math.round(row.distanceKm).toLocaleString('en-US').padStart(7);
    const tiltStr = row.tiltDeg.toFixed(1).padStart(6);
    console.log(
      `${datetimeStr}| ${altitudeStr} | ${azimuthStr} | ${illuminationStr} | ${distanceStr} | ${tiltStr}`,
    );
  }
}

const PHASE_EVENT_LABEL: Record<PhaseEventName, string> = {
  'new': 'New Moon',
  'first-quarter': 'First Quarter',
  'full': 'Full Moon',
  'third-quarter': 'Last Quarter',
};

export function printSummary(
  s: MoonSummary,
  observer: Observer,
  day: ObservingDay,
): void {
  const illuminationStr = s.noon.illuminatedFraction.toFixed(1) + '%';
  const distanceStr = Math.round(s.noon.distanceKm).toLocaleString('en-US') + ' km';
  const NONE_STR = 'not observed today';

  // A day spanning a DST transition has two offsets; showing both makes the 23-
  // and 25-hour days self-announcing.
  const startOffset = day.start.offset;
  const endOffset = day.end.subtract({ minutes: 1 }).offset;
  const offsetStr = startOffset === endOffset ? startOffset : `${startOffset} → ${endOffset}`;

  console.log('Summary');
  console.log('--------------------------------------------------------------------------------');
  console.log('Observation Parameters:');
  console.log(`  Date:         ${observer.date}`);
  console.log(`  Time Zone:    ${observer.timeZone} (${offsetStr})`);
  console.log(`  Location:     ${observer.lat}, ${observer.lon}, ${observer.elevationMeter} meters`);
  console.log('  Step Size:    1 minute');
  console.log();
  console.log('Noon (Average):');
  console.log(`  Illumination: ${illuminationStr}`);
  console.log(`  Distance:     ${distanceStr}`);
  console.log('Events:');
  console.log(
    '  Phase:    ' + (
      s.events.phaseEvent ?
        `${PHASE_EVENT_LABEL[s.events.phaseEvent.name]} (${formatTime12h(s.events.phaseEvent.at)})` :
        NONE_STR
    )
  );
  console.log(
    '  Moonrise: ' + (
      s.events.moonrise ?
        `${formatTime12h(s.events.moonrise.at)} (Azimuth: ${s.events.moonrise.azimuthDeg.toFixed(0)}°, Tilt: ${s.events.moonrise.tiltDeg.toFixed(0)}°)` :
        NONE_STR
    )
  );
  console.log(
    '  Moonset:  ' + (
      s.events.moonset ?
        `${formatTime12h(s.events.moonset.at)} (Azimuth: ${s.events.moonset.azimuthDeg.toFixed(0)}°, Tilt: ${s.events.moonset.tiltDeg.toFixed(0)}°)` :
        NONE_STR
    )
  );
  console.log(`  Sunrise:  ${s.events.sunrise ? formatTime12h(s.events.sunrise) : NONE_STR}`);
  console.log(`  Sunset:   ${s.events.sunset  ? formatTime12h(s.events.sunset)  : NONE_STR}`);
}

export function printFixtureJson(summary: MoonSummary): void {
  const { date } = summary.metadata;
  // Stamped from each event's own instant, so a day with two offsets — and the
  // repeated hour of a fall-back day — comes out right.
  const toDateTime = (at: Temporal.ZonedDateTime) =>
    at.toString({ smallestUnit: 'second', timeZoneName: 'never' });

  // Every event is nullable and every shape is spelled out at its own key, so
  // the null check is the only part worth sharing.
  const orNull = <T, R>(event: T | null, shape: (event: T) => R): R | null =>
    event ? shape(event) : null;

  const fixture = {
    description: '',
    day: date,
    noon: {
      illumination: Math.round(summary.noon.illuminatedFraction),
      distanceKm: Math.round(summary.noon.distanceKm),
    },
    events: {
      phaseEvent: orNull(summary.events.phaseEvent, (e) => ({
        name: e.name,
        dateTime: toDateTime(e.at),
      })),
      moonrise: orNull(summary.events.moonrise, (e) => ({
        dateTime: toDateTime(e.at),
        azimuthDeg: e.azimuthDeg,
        tiltDeg: e.tiltDeg,
      })),
      moonset: orNull(summary.events.moonset, (e) => ({
        dateTime: toDateTime(e.at),
        azimuthDeg: e.azimuthDeg,
        tiltDeg: e.tiltDeg,
      })),
      sunrise: orNull(summary.events.sunrise, (at) => ({
        dateTime: toDateTime(at),
      })),
      sunset: orNull(summary.events.sunset, (at) => ({
        dateTime: toDateTime(at),
      })),
    },
  };

  console.log('Fixture JSON');
  console.log('--------------------------------------------------------------------------------');
  console.log(JSON.stringify(fixture, null, 2));
}

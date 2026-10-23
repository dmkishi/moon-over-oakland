import pc from 'picocolors';
import type { PhaseType } from '../../../src/ephemeris/phase.ts';
import { MOON_EPHEMERIS_STEP_SIZE, type EphemerisDisplayRow } from './ephemeris.ts';
import type { MoonSummary } from './summary.ts';

/**
 * Formats an instant's local wall clock as 12-hour time, e.g. "7:30 PM".
 */
function formatTime12h(at: Temporal.ZonedDateTime): string {
  const h = at.hour % 12 || 12;
  const period = at.hour < 12 ? 'AM' : 'PM';
  return `${h}:${String(at.minute).padStart(2, '0')} ${period}`;
}

/**
 * Formats an instant's local wall clock as "YYYY-MM-DD HH:MM".
 */
function formatDateTime(at: Temporal.ZonedDateTime): string {
  return at.toPlainDateTime().toString({ smallestUnit: 'minute' }).replace('T', ' ');
}

/**
 * A list of the occurrences during the interval, delimited by semicolons, e.g.
 * "transit 7:21; sunrise 7:26".
 */
function formatEvents(events: EphemerisDisplayRow['events']): string {
  return events
    .map(({ name, at }) => `${name} ${at.hour}:${String(at.minute).padStart(2, '0')}`)
    .join('; ');
}

export function printTable(displayRows: EphemerisDisplayRow[]): void {
  console.log(
    'Datetime            | Altº   | Azº    | Illum% | KM      | Tiltº  | Events',
  );
  console.log(
    '────────────────────┼────────┼────────┼────────┼─────────┼────────┼────────',
  );
  for (const { row, events } of displayRows) {
    const datetimeStr = `${formatDateTime(row.at)} ${row.flags.join('')}`.padEnd(20);
    const altitudeStr = row.altitudeDeg.toFixed(1).padStart(6);
    const azimuthStr = row.azimuthDeg.toFixed(1).padStart(6);
    const illuminationStr = row.illuminatedPercent.toFixed(3).padStart(6);
    const distanceStr = Math.round(row.distanceKm).toLocaleString('en-US').padStart(7);
    const tiltStr = row.tiltDeg.toFixed(1).padStart(6);
    console.log(
      `${datetimeStr}| ${altitudeStr} | ${azimuthStr} | ${illuminationStr} | ${distanceStr} | ${tiltStr} | ${formatEvents(events)}`.trimEnd(),
    );
  }
}

/**
 * The same rows and columns as `printTable` in CSV for piping elsewhere.
 *
 * No commas in field values so no quoting is needed: the distance column drops
 * the thousands separator, and the events column separates with semicolons.
 * Unlike the other printers this one emits no title or rule line, which would
 * not survive a CSV parser.
 */
export function printCsv(displayRows: EphemerisDisplayRow[]): void {
  console.log('Datetime,Flags,Altitude Deg,Azimuth Deg,Illuminated Pct,Distance Km,Tilt Deg,Events');
  for (const { row, events } of displayRows) {
    console.log([
      formatDateTime(row.at),
      // The table mashes these onto the end of the datetime cell; a column of
      // their own is what makes them readable to whatever consumes this.
      row.flags.join(''),
      row.altitudeDeg.toFixed(1),
      row.azimuthDeg.toFixed(1),
      row.illuminatedPercent.toFixed(3),
      Math.round(row.distanceKm),
      row.tiltDeg.toFixed(1),
      formatEvents(events),
    ].join(','));
  }
}

const PHASE_EVENT_LABEL: Record<PhaseType, string> = {
  'new': 'New Moon',
  'first-quarter': 'First Quarter',
  'full': 'Full Moon',
  'last-quarter': 'Last Quarter',
};

export function printSummary(s: MoonSummary): void {
  const { site, day } = s;
  const illuminationStr = s.noon.illuminatedPercent.toFixed(1) + '%';
  const distanceStr = Math.round(s.noon.distanceKm).toLocaleString('en-US') + ' km';
  const NONE_STR = pc.red('NONE');

  // A day spanning a DST transition has two offsets; showing both makes the 23-
  // and 25-hour days self-announcing.
  const startOffset = day.start.offset;
  const endOffset = day.end.subtract({ minutes: 1 }).offset;
  const offsetStr = startOffset === endOffset ? startOffset : `${startOffset} → ${endOffset}`;

  console.log('Summary');
  console.log('--------------------------------------------------------------------------------');
  console.log('Observation Parameters:');
  console.log(`  Date:         ${day.start.toPlainDate().toString()}`);
  console.log(`  Time Zone:    ${site.timezone} (${offsetStr})`);
  console.log(`  Location:     ${site.latitude}, ${site.longitude}, ${site.elevationMeter} meters`);
  console.log(`  Query Step:   ${MOON_EPHEMERIS_STEP_SIZE}`);
  console.log();
  console.log('Noon (Average):');
  console.log(`  Illumination: ${illuminationStr}`);
  console.log(`  Distance:     ${distanceStr}`);

  console.log('Events:');
  console.log(
    '  Phase:       ' + (
      s.events.phaseEvent ?
        `${PHASE_EVENT_LABEL[s.events.phaseEvent.name]} (${formatTime12h(s.events.phaseEvent.at)})` :
        NONE_STR
    )
  );
  console.log(
    '  Moonrise:    ' + (
      s.events.moonrise ?
        `${formatTime12h(s.events.moonrise.at)} (Azimuth: ${s.events.moonrise.azimuthDeg.toFixed(0)}°, Tilt: ${s.events.moonrise.tiltDeg.toFixed(0)}°)` :
        NONE_STR
    )
  );
  console.log(
    '  Moonset:     ' + (
      s.events.moonset ?
        `${formatTime12h(s.events.moonset.at)} (Azimuth: ${s.events.moonset.azimuthDeg.toFixed(0)}°, Tilt: ${s.events.moonset.tiltDeg.toFixed(0)}°)` :
        NONE_STR
    )
  );
  console.log(`  Transit:     ${s.events.transit ? formatTime12h(s.events.transit) : NONE_STR}`);
  console.log(`  Sunrise:     ${s.events.sunrise ? formatTime12h(s.events.sunrise) : NONE_STR}`);
  console.log(`  Sunset:      ${s.events.sunset  ? formatTime12h(s.events.sunset)  : NONE_STR}`);
}

/**
 * Reshapes an event for the fixture or `null` when the day has none.
 */
function fixtureEventOrNull<Event, FixtureEvent>(
  event: Event | null,
  toFixtureEvent: (event: Event) => FixtureEvent,
): FixtureEvent | null {
  if (event === null) return null;
  return toFixtureEvent(event);
}

/**
 * Formats a `ZonedDateTime` as an RFC 3339 timestamp, to the second.
 *
 * @example
 * toDateTime(
 *   Temporal.ZonedDateTime.from('2026-06-15T20:05:42.5-07:00[America/Los_Angeles]')
 * ); // "2026-06-15T20:05:42-07:00"
 */
function toDateTime(at: Temporal.ZonedDateTime): string {
  return at.toString({ smallestUnit: 'second', timeZoneName: 'never' });
}

export function printFixtureJson(summary: MoonSummary): void {
  const fixture = {
    description: '',
    day: summary.day.start.toPlainDate().toString(),
    noon: {
      illuminationPercent: summary.noon.illuminatedPercent,
      distanceKm: Math.round(summary.noon.distanceKm),
    },
    events: {
      phaseEvent: fixtureEventOrNull(summary.events.phaseEvent, (event) => ({
        name: event.name,
        dateTime: toDateTime(event.at),
      })),
      moonrise: fixtureEventOrNull(summary.events.moonrise, (event) => ({
        dateTime: toDateTime(event.at),
        azimuthDeg: event.azimuthDeg,
        tiltDeg: event.tiltDeg,
      })),
      moonset: fixtureEventOrNull(summary.events.moonset, (event) => ({
        dateTime: toDateTime(event.at),
        azimuthDeg: event.azimuthDeg,
        tiltDeg: event.tiltDeg,
      })),
      transit: fixtureEventOrNull(summary.events.transit, (at) => ({
        dateTime: toDateTime(at),
      })),
      sunrise: fixtureEventOrNull(summary.events.sunrise, (at) => ({
        dateTime: toDateTime(at),
      })),
      sunset: fixtureEventOrNull(summary.events.sunset, (at) => ({
        dateTime: toDateTime(at),
      })),
    },
  };

  console.log('Fixture JSON');
  console.log('--------------------------------------------------------------------------------');
  console.log(JSON.stringify(fixture, null, 2));
}

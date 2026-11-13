/**
 * Lays out a year of posts as a printable page: a one-page summary table, then
 * each post as a card with its details, grouped by month. Moon images are left
 * out.
 */
import { MAX_GRAPHEMES } from '../../src/bluesky.ts';
import type { PhaseType } from '../../src/ephemeris/phase.ts';
import type { EventDelta } from '../../src/event-delta.ts';
import { observer } from '../../src/observer.ts';
import type { YearPost } from './collect.ts';

const PHASE_NAMES: Record<PhaseType, string> = {
  'new': 'New',
  'first-quarter': 'First quarter',
  'full': 'Full',
  'last-quarter': 'Last quarter',
};
/**
 * The shadowed part of each phase's glyph, drawn in ink so it survives
 * grayscale printing. Follows the almanac convention, as seen from the northern
 * hemisphere: new is solid, full is open, first quarter is dark on the left and
 * last quarter is dark on the right.
 */
const PHASE_SHADOWS: Record<PhaseType, string> = {
  'new': '<circle cx="6" cy="6" r="5"/>',
  'first-quarter': '<path d="M6 1a5 5 0 0 0 0 10z"/>',
  'full': '',
  'last-quarter': '<path d="M6 1a5 5 0 0 1 0 10z"/>',
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = MONTHS.map((month) => month.slice(0, 3));
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const zoneNameFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: observer.timezone,
  timeZoneName: 'short',
});

/**
 * @pure
 */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Sets an acronym in small caps, e.g. "AM", "PST". The text stays uppercase,
 * so search and copy-paste still give "AM".
 * @pure
 */
function caps(text: string): string {
  return `<span class="caps">${text}</span>`;
}

/**
 * E.g. "PST", "PDT".
 * @pure
 */
function zoneName(zoned: Temporal.ZonedDateTime): string {
  return zoneNameFormat.formatToParts(zoned.epochMilliseconds)
    .find((part) => part.type === 'timeZoneName')?.value ?? '';
}

/**
 * E.g. "2:02 AM".
 * @pure
 */
function formatClock(zoned: Temporal.ZonedDateTime): string {
  const hour = zoned.hour % 12 || 12;
  return `${hour}:${String(zoned.minute).padStart(2, '0')} ${caps(zoned.hour < 12 ? 'AM' : 'PM')}`;
}

/**
 * E.g. "Jan. 3 (Saturday)".
 * @pure
 */
function formatPostDate(date: Temporal.PlainDate | Temporal.ZonedDateTime): string {
  return `${SHORT_MONTHS[date.month - 1]}. ${date.day} (${WEEKDAYS[date.dayOfWeek - 1]})`;
}

/**
 * E.g. "Nov. 10, 2026".
 * @pure
 */
function formatLongDate(date: Temporal.PlainDate): string {
  return `${SHORT_MONTHS[date.month - 1]}. ${date.day}, ${date.year}`;
}

/**
 * Clock time in the observer's zone, flagged when it falls on another day than
 * the post, e.g. "8:00 AM (next day)". Optionally with the zone name.
 * @pure
 */
function formatTime(
  zoned: Temporal.ZonedDateTime,
  postDate: Temporal.PlainDate,
  { isZoneShown = false }: { isZoneShown?: boolean } = {},
): string {
  const local = zoned.withTimeZone(observer.timezone);
  const clock = isZoneShown
    ? `${formatClock(local)} <span class="muted">${caps(zoneName(local))}</span>`
    : formatClock(local);
  const days = local.toPlainDate().since(postDate).days;
  if (days === 0) return clock;

  let label = formatPostDate(local);
  if (days === 1) label = 'next day';
  else if (days === -1) label = 'prev. day';
  return `${clock} <span class="muted">(${label})</span>`;
}

/**
 * E.g. "−48 min before sunset".
 * @pure
 */
function formatDelta({ minutes, reference }: EventDelta): string {
  if (minutes === 0) return `<span class="num">0</span> min <span class="muted">at ${reference}</span>`;
  const signed = minutes > 0 ? `+${minutes}` : `−${-minutes}`;
  const relation = `${minutes > 0 ? 'after' : 'before'} ${reference}`;
  return `<span class="num">${signed}</span> min <span class="muted">${relation}</span>`;
}

/**
 * E.g. "99.9%".
 * @pure
 */
function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/**
 * Room left under the limit, then the count, e.g. "−12 (288)".
 * @pure
 */
function formatGraphemes(graphemes: number): string {
  const count = `<span class="muted">(${graphemes})</span>`;
  const delta = graphemes - MAX_GRAPHEMES;
  if (delta === 0) return `0 ${count}`;
  return `${delta > 0 ? `+${delta}` : `−${-delta}`} ${count}`;
}

/**
 * @pure
 */
function renderPhaseGlyph(type: PhaseType): string {
  return /* html */ `<svg class="phase-glyph" viewBox="0 0 12 12" aria-hidden="true"><g fill="currentColor">${PHASE_SHADOWS[type]}</g><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor"/></svg>`;
}

/**
 * @pure
 */
function renderSummaryRow(post: YearPost): string {
  const { date, phaseEvent } = post;
  const { type, time, dayEvents } = phaseEvent;
  return `
    <tr>
      <td>${renderPhaseGlyph(type)}${PHASE_NAMES[type]}</td>
      <td class="num"><a href="#post-${date.toString()}">${date.month}-${date.day}</a></td>
      <td class="num">${formatTime(time, date, { isZoneShown: true })}</td>
      <td class="num">${formatTime(dayEvents.moonrise, date)}</td>
      <td class="num">${formatTime(dayEvents.moonset, date)}</td>
      <td class="num summary__cell--right">${formatGraphemes(post.graphemes)}</td>
    </tr>`;
}

/**
 * @pure
 */
function renderPostCard(post: YearPost): string {
  const { date, phaseEvent } = post;
  const { time, day, dayEvents, eventDeltas } = phaseEvent;
  const paragraphs = post.text
    .split('\n\n')
    .map((block) => `<p>${escapeHtml(block).replaceAll('\n', '<br>')}</p>`)
    .join('');
  const instant = time.withTimeZone(observer.timezone);
  const instantNote = day === 'tomorrow'
    ? `<div class="post__note">Falls after midnight, before the 4:00 ${caps('AM')} cutoff, so it posts the day before.</div>`
    : '';

  return /* html */`
    <article class="post" id="post-${date.toString()}">
      <header class="post__header">
        <h3 class="post__date">${formatPostDate(date)}</h3>
      </header>

      <div class="post__body">
        <div class="post__text">${paragraphs}</div>
        <dl class="post__details">
          <dt>Phase instant</dt>
          <dd class="num">${formatClock(instant)} ${caps(zoneName(instant))}, ${formatPostDate(instant)}${instantNote}</dd>
          <dt>Illuminated</dt>
          <dd class="num">${formatPercent(post.illuminatedFraction)}</dd>
          <dt>Moonrise</dt>
          <dd class="num">${formatTime(dayEvents.moonrise, date)}<div>${formatDelta(eventDeltas.moonrise)}</div></dd>
          <dt>Moonset</dt>
          <dd class="num">${formatTime(dayEvents.moonset, date)}<div>${formatDelta(eventDeltas.moonset)}</div></dd>
          <dt>Sunrise</dt>
          <dd class="num">${formatTime(dayEvents.sunrise, date)}</dd>
          <dt>Sunset</dt>
          <dd class="num">${formatTime(dayEvents.sunset, date)}</dd>
          <dt>Length</dt>
          <dd class="num">${post.graphemes} / ${MAX_GRAPHEMES} graphemes</dd>
        </dl>
      </div>

      <p class="post__alt"><span class="post__label">Alt text</span> ${escapeHtml(post.alt)}</p>
    </article>`;
}

/**
 * @pure
 */
function renderStat(value: string | number, label: string): string {
  return /* html */ `<div class="stat"><span class="stat__value">${value}</span><span class="stat__label">${label}</span></div>`;
}

/**
 * @pure
 */
export function renderYearHtml(
  year: number,
  posts: YearPost[],
  generatedOn: Temporal.PlainDate,
): string {
  const title = `Moon Over Oakland: ${year} Posts`;
  const count = (type: PhaseType) => posts.filter((post) => post.phaseEvent.type === type).length;
  const longest = Math.max(0, ...posts.map((post) => post.graphemes));

  const months = MONTHS.map((name, index) => {
    const monthPosts = posts.filter((post) => post.date.month === index + 1);
    if (monthPosts.length === 0) return '';
    return /* html */ `
      <section class="month">
        <h2 class="month__title">${name}</h2>
        ${monthPosts.map((post) => renderPostCard(post)).join('')}
      </section>`;
  }).join('');

  return /* html */ `
<!doctype html>
<html lang="en">
  <head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    :root {
      --ink: #1c1f24;
      --muted: #6b7280;
      --rule: #dde1e6;
      --panel: #f5f6f8;
      --font: system-ui, -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif;
    }

    @page {
      size: letter;
      margin: 0.6in 0.65in 0.7in;
      font: 7.5pt var(--font);
      color: var(--muted);

      @bottom-left {
        content: 'Generated ${formatLongDate(generatedOn)}';
      }

      @bottom-center {
        content: '${title}';
        font-weight: 500;
      }

      @bottom-right {
        content: counter(page) ' / ' counter(pages);
      }
    }

    * {
      box-sizing: border-box;
    }
    html {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      margin: 0;
      color: var(--ink);
      font: 9.5pt/1.4 var(--font);
    }
    a {
      color: inherit;
      text-decoration: none;
    }
    .num {
      font-variant-numeric: tabular-nums;
    }
    .muted {
      color: var(--muted);
    }
    .caps {
      font-variant-caps: all-small-caps;
      font-synthesis-small-caps: none;
      letter-spacing: 0.05em;
    }

    .cover__title {
      font-size: 17pt;
      font-weight: 700;
      letter-spacing: -0.01em;
      margin: 0;
    }
    .cover__lede {
      margin: 2pt 0 6pt;
      color: var(--muted);
      font-size: 8.5pt;
    }

    .stats {
      display: flex;
      justify-content: space-between;
      gap: 1em;
      margin: 0 0 8pt;
      padding: 4pt 0;
      border-block: 1px solid var(--rule);
    }
    .stat__value {
      font-size: 11pt;
      font-weight: 650;
      margin-right: 3pt;
    }
    .stat__label {
      font-size: 8.5pt;
      color: var(--muted);
      font-variant-caps: all-small-caps;
      letter-spacing: 0.04em;
    }

    .summary {
      width: 100%;
      border-collapse: collapse;
      font-size: 7.3pt;
      line-height: 1.2;
    }
    .summary th {
      text-align: left;
      font-weight: 600;
      color: var(--muted);
      font-variant-caps: all-small-caps;
      letter-spacing: 0.04em;
      padding: 0 4pt 2pt;
      border-bottom: 1px solid var(--ink);
    }
    .summary td {
      padding: 1pt 4pt;
      border-bottom: 1px solid var(--rule);
      white-space: nowrap;
    }
    .summary .summary__cell--right {
      text-align: right;
    }

    .phase-glyph {
      width: 7pt;
      height: 7pt;
      margin-right: 4pt;
      vertical-align: -1pt;
    }

    .cover {
      break-after: page;
    }
    .month__title {
      font-size: 13pt;
      margin: 4pt 0 6pt;
      padding-bottom: 3pt;
      border-bottom: 2px solid var(--ink);
      break-after: avoid;
    }

    .post {
      break-inside: avoid;
      border: 1px solid var(--rule);
      border-radius: 5pt;
      padding: 7pt 10pt 6pt;
      margin-bottom: 7pt;
    }
    .post__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4pt;
    }
    .post__date {
      margin: 0;
      font-size: 10pt;
    }
    .post__body {
      display: grid;
      grid-template-columns: 1fr 19.5em;
      gap: 12pt;
    }
    .post__text {
      font-family: 'Times New Roman', Times, serif;
      font-size: 10pt;
      line-height: 1.38;
    }
    .post__text p {
      margin: 0 0 5pt;
    }
    .post__details {
      margin: 0;
      padding: 5pt 8pt;
      background: var(--panel);
      border-radius: 4pt;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 1.5pt 8pt;
      font-size: 7.5pt;
      line-height: 1.3;
      align-content: start;
    }
    .post__details dt {
      color: var(--muted);
    }
    .post__details dd {
      margin: 0;
    }
    .post__note {
      color: var(--muted);
      font-size: 6.8pt;
      line-height: 1.25;
      margin-top: 1pt;
    }
    .post__alt {
      margin: 4pt 0 0;
      padding-top: 4pt;
      border-top: 1px dashed var(--rule);
      font-size: 7.3pt;
      color: var(--muted);
    }
    .post__label {
      font-weight: 600;
      color: var(--ink);
      font-variant-caps: all-small-caps;
      letter-spacing: 0.04em;
      margin-right: 3pt;
    }
  </style>
  </head>
  <body>
    <section class="cover">
      <h1 class="cover__title">${title}</h1>
      <p class="cover__lede">Every post the posting code generates for ${year}, one per principal moon phase, for Oakland, ${caps('CA')}. Times are Pacific (${caps('PST')}/${caps('PDT')}). A post goes out on the day its phase falls between 4:00 ${caps('AM')} and 4:00 ${caps('AM')} the next day. Moon images are left out.</p>
      <div class="stats">
        ${renderStat(posts.length, 'Posts')}
        ${renderStat(count('new'), 'New')}
        ${renderStat(count('first-quarter'), 'First quarter')}
        ${renderStat(count('full'), 'Full')}
        ${renderStat(count('last-quarter'), 'Last quarter')}
        ${renderStat(`${longest} / ${MAX_GRAPHEMES}`, 'Longest post (graphemes)')}
      </div>
      <table class="summary">
        <thead>
          <tr>
            <th>Phase</th>
            <th>Post date</th>
            <th>Phase instant</th>
            <th>Moonrise</th>
            <th>Moonset</th>
            <th class="summary__cell--right">Graphemes</th>
          </tr>
        </thead>
        <tbody>
          ${posts.map((post) => renderSummaryRow(post)).join('')}
        </tbody>
      </table>
    </section>

    ${months}
  </body>
</html>
`;
}

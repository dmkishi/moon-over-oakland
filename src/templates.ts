import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Liquid } from 'liquidjs';
import type { MoonPost } from './moonPost.js';

function createEngine(timezone: string): Liquid {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return new Liquid({
    root: join(__dirname, 'templates'),
    extname: '.liquid',
    timezoneOffset: timezone,
  });
}

export async function renderPost(
  moonPost: MoonPost,
  timezone: string,
): Promise<string> {
  const engine = createEngine(timezone);
  const result = await engine.renderFile('post', moonPost);
  return result.trim();
}

/**
 * Renders a data report for the given moon day.
 */
export async function renderReport(
  moonDay: MoonPost,
  timezone: string,
): Promise<string> {
  const today = moonDay.day;
  const engine = createEngine(timezone);

  engine.registerFilter('localeString', (value: number) => value.toLocaleString());

  engine.registerFilter('daysAway', (date: Date) => {
    const msPerDay = 24 * 60 * 60 * 1000;
    const todayStart = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const targetStart = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((targetStart - todayStart) / msPerDay);
  });

  const result = await engine.renderFile('report', moonDay);
  return result.trimEnd();
}

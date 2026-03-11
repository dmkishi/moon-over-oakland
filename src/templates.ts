import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Liquid } from 'liquidjs';
import type { MoonDay } from './moonDay.js';

function createEngine(timezone: string): Liquid {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return new Liquid({
    root: join(__dirname, 'templates'),
    extname: '.liquid',
    timezoneOffset: timezone,
  });
}

export async function renderPost(
  moonDay: MoonDay,
  timezone: string,
): Promise<string> {
  const engine = createEngine(timezone);
  const result = await engine.renderFile('post', moonDay);
  return result.trim();
}

export async function renderDataReport(
  moonDay: MoonDay,
  timezone: string,
): Promise<string> {
  const today = moonDay.date;
  const engine = createEngine(timezone);

  engine.registerFilter('localeString', (value: number) => value.toLocaleString());

  engine.registerFilter('daysAway', (date: Date) => {
    const msPerDay = 24 * 60 * 60 * 1000;
    const todayStart = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const targetStart = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((targetStart - todayStart) / msPerDay);
  });

  const result = await engine.renderFile('dataReport', moonDay);
  return result.trimEnd();
}

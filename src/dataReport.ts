import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Liquid } from 'liquidjs';
import type { MoonData } from './moon.js';

export async function renderDataReport(
  moonData: MoonData,
  now: Date,
  timezone: string,
): Promise<string> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const engine = new Liquid({
    root: join(__dirname, 'templates'),
    extname: '.liquid',
    timezoneOffset: timezone,
  });

  engine.registerFilter('localeString', (value: number) => value.toLocaleString());

  engine.registerFilter('daysAway', (date: Date) => {
    const msPerDay = 24 * 60 * 60 * 1000;
    const todayStart = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const targetStart = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((targetStart - todayStart) / msPerDay);
  });

  const result = await engine.renderFile('dataReport', { ...moonData, now });
  return result.trimEnd();
}

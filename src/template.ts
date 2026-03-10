import { Liquid } from 'liquidjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { MoonData } from './moon.js';

export async function renderTemplate(
  moonData: MoonData,
  timezone: string
): Promise<string> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const engine = new Liquid({
    root: join(__dirname, 'templates'),
    extname: '.liquid',
    timezoneOffset: timezone,
  });

  const context = {
    ...moonData,
    date: new Date(),
  };
  const result = await engine.renderFile('post', context);
  return result.trim();
}

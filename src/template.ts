import { Liquid } from 'liquidjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { MoonData } from './moon.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const engine = new Liquid({
  root: join(__dirname, 'templates'),
  extname: '.liquid',
});

export interface TemplateContext {
  phase: string;
  illumination: number;
  age: number;
  distance: number;
  moonrise: string | null;
  moonset: string | null;
  nextNewMoon: string;
  nextFullMoon: string;
  date: string;
}

function formatTime(date: Date | null, timezone: string): string | null {
  if (!date) return null;
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  });
}

function formatDate(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  });
}

export async function renderTemplate(
  moonData: MoonData,
  timezone: string
): Promise<string> {
  const context: TemplateContext = {
    phase: moonData.phase,
    illumination: moonData.illumination,
    age: moonData.age,
    distance: moonData.distance,
    moonrise: formatTime(moonData.moonrise, timezone),
    moonset: formatTime(moonData.moonset, timezone),
    nextNewMoon: formatDate(moonData.nextNewMoon, timezone),
    nextFullMoon: formatDate(moonData.nextFullMoon, timezone),
    date: formatDate(new Date(), timezone),
  };

  const result = await engine.renderFile('post', context);
  return result.trim();
}

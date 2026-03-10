import { Liquid } from 'liquidjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { MoonData } from './moon.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface TemplateContext {
  phase: string;
  illumination: number;
  age: number;
  distance: number;
  moonrise: Date | null;
  moonset: Date | null;
  nextNewMoon: Date;
  nextFullMoon: Date;
  date: Date;
}

export async function renderTemplate(
  moonData: MoonData,
  timezone: string
): Promise<string> {
  const engine = new Liquid({
    root: join(__dirname, 'templates'),
    extname: '.liquid',
    timezoneOffset: timezone,
  });

  const context: TemplateContext = {
    phase: moonData.phase,
    illumination: moonData.illumination,
    age: moonData.age,
    distance: moonData.distance,
    moonrise: moonData.moonrise,
    moonset: moonData.moonset,
    nextNewMoon: moonData.nextNewMoon,
    nextFullMoon: moonData.nextFullMoon,
    date: new Date(),
  };

  const result = await engine.renderFile('post', context);
  return result.trim();
}

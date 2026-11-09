/**
 * Every post the posting code would make over a calendar year, by running it
 * for each day, the way `pnpm preview <date>` does.
 */
import { graphemeLength } from '../../src/bluesky.ts';
import { moonDisc } from '../../src/ephemeris/moon-disc.ts';
import { observer } from '../../src/observer.ts';
import { calculatePhaseEvent, type PhaseEvent } from '../../src/phase-event.ts';
import { renderAltText, renderPost } from '../../src/post.ts';

export interface YearPost {
  /** The day the post goes out. */
  date: Temporal.PlainDate;
  phaseEvent: PhaseEvent;
  illuminatedFraction: number;
  text: string;
  alt: string;
  graphemes: number;
}

export function collectPosts(year: number): YearPost[] {
  const posts: YearPost[] = [];
  for (
    let date = Temporal.PlainDate.from({ year, month: 1, day: 1 });
    date.year === year;
    date = date.add({ days: 1 })
  ) {
    const phaseEvent = calculatePhaseEvent(date, observer.timezone, observer.latitude, observer.longitude);
    if (phaseEvent === null) continue;

    const { illuminatedFraction } = moonDisc(phaseEvent.time.toInstant());
    const text = renderPost(phaseEvent, observer.timezone);
    posts.push({
      date,
      phaseEvent,
      illuminatedFraction,
      text,
      alt: renderAltText(phaseEvent, illuminatedFraction, observer.timezone),
      graphemes: graphemeLength(text),
    });
  }
  return posts;
}

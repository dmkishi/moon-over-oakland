// oxlint-disable unicorn/numeric-separators-style - Years read as years, not 2_026
import { beforeAll, describe, it, expect } from 'vitest';
import { collectPosts, type YearPost } from '../../scripts/posts-pdf/collect.ts';
import { renderYearHtml } from '../../scripts/posts-pdf/html.ts';
import { graphemeLength, MAX_GRAPHEMES } from '../../src/bluesky.ts';

/**
 * The page's visible text, without markup, so a change of tags or classes
 * doesn't fail an assertion about what a reader sees.
 * @pure
 */
function textOf(html: string): string {
  return html.replaceAll(/<[^>]*>/gu, '').replaceAll(/\s+/gu, ' ');
}

const generatedOn = Temporal.PlainDate.from('2026-11-10');
let posts: YearPost[];
beforeAll(() => {
  posts = collectPosts(2026);
});

describe('collectPosts', () => {
  it('finds one post per principal phase of the year', () => {
    const types = posts.map((post) => post.phaseEvent.type);
    expect(posts).toHaveLength(50);
    expect(types.filter((type) => type === 'new')).toHaveLength(12);
    expect(types.filter((type) => type === 'first-quarter')).toHaveLength(12);
    expect(types.filter((type) => type === 'full')).toHaveLength(13);
    expect(types.filter((type) => type === 'last-quarter')).toHaveLength(13);
  });

  it('dates a phase before the 4:00 AM cutoff to the day before', () => {
    const [first] = posts;
    expect(first!.date.toString()).toBe('2026-01-02');
    expect(first!.phaseEvent.type).toBe('full');
    expect(first!.phaseEvent.day).toBe('tomorrow');
  });

  it('stays within the year', () => {
    expect(posts.every((post) => post.date.year === 2026)).toBe(true);
  });
});

describe('renderYearHtml', () => {
  it('renders a card and a summary row for every post', () => {
    const html = renderYearHtml(2026, posts, generatedOn);
    expect(html.match(/<article class="post"/gu)).toHaveLength(50);
    expect(html.match(/<a href="#post-/gu)).toHaveLength(50);
    expect(html).toContain('<title>Moon Over Oakland: 2026 Posts</title>');
  });

  it('dates the footer', () => {
    expect(renderYearHtml(2026, posts, generatedOn)).toContain("content: 'Generated Nov. 10, 2026';");
  });

  // The 2026-01-02 post, for the full moon at 2:02 AM on 01-03.
  it('dates the post and its phase in local time', () => {
    const text = textOf(renderYearHtml(2026, posts.slice(0, 1), generatedOn));
    expect(text).toContain('Jan. 2 (Friday)');
    expect(text).toContain('2:02 AM PST, Jan. 3 (Saturday)');
    expect(text).toContain('8:00 AM (next day)');
  });

  it('notes a phase that posts the day before', () => {
    const sameDay = posts.find((post) => post.phaseEvent.day === 'today')!;
    expect(renderYearHtml(2026, posts.slice(0, 1), generatedOn)).toContain('class="post__note"');
    expect(renderYearHtml(2026, [sameDay], generatedOn)).not.toContain('class="post__note"');
  });

  it('shows the delta, illumination, and length of a post', () => {
    const [first] = posts;
    const text = textOf(renderYearHtml(2026, [first!], generatedOn));
    expect(text).toContain('−48 min');
    expect(text).toContain('99.9%');
    expect(text).toContain(`${graphemeLength(first!.text)} / ${MAX_GRAPHEMES}`);
  });

  it('shows daylight time in summer', () => {
    const july = posts.filter((post) => post.date.month === 7);
    expect(renderYearHtml(2026, july, generatedOn)).toContain('<span class="caps">PDT</span>');
  });

  it('keeps the post and alt text verbatim, without small caps', () => {
    const [first] = posts;
    const html = renderYearHtml(2026, [first!], generatedOn);
    expect(first!.alt).toContain('2:02 am');
    expect(html).toContain(first!.alt);
  });

  it('escapes post and alt text', () => {
    const html = renderYearHtml(2026, [{ ...posts[0]!, text: '<b>&', alt: '"x"' }], generatedOn);
    expect(html).toContain('<p>&lt;b&gt;&amp;</p>');
    expect(html).toContain('&quot;x&quot;');
  });

  it('keeps blank-line paragraphs and line breaks of the post', () => {
    const html = renderYearHtml(2026, [{ ...posts[0]!, text: 'a\nb\n\nc' }], generatedOn);
    expect(html).toContain('<p>a<br>b</p><p>c</p>');
  });
});

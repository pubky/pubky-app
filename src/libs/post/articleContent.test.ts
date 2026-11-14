import { describe, expect, it } from 'vitest';
import { buildArticleContent, isArticleContent, parseArticleContent } from './articleContent';

describe('parseArticleContent', () => {
  it('returns null for nullish and empty input', () => {
    expect(parseArticleContent(null)).toBeNull();
    expect(parseArticleContent(undefined)).toBeNull();
    expect(parseArticleContent('')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseArticleContent('not valid json')).toBeNull();
  });

  it('returns null when title or body is missing', () => {
    expect(parseArticleContent(JSON.stringify({ title: 'Title' }))).toBeNull();
    expect(parseArticleContent(JSON.stringify({ body: 'Body' }))).toBeNull();
  });

  it('returns null when title or body is not a string', () => {
    expect(parseArticleContent(JSON.stringify({ title: 123, body: 'Body' }))).toBeNull();
    expect(parseArticleContent(JSON.stringify({ title: 'Title', body: null }))).toBeNull();
  });

  it('parses a valid article envelope, with no cover for a 0.x one', () => {
    expect(parseArticleContent(JSON.stringify({ title: 'Title', body: 'Body', extra: true }))).toEqual({
      title: 'Title',
      body: 'Body',
      cover_image: null,
    });
  });

  it('reads the cover of a v1 envelope and treats a null, empty or non-string one as none', () => {
    const cover = 'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/social/v1/files/0ABC.png';
    expect(parseArticleContent(JSON.stringify({ title: 'T', body: 'B', cover_image: cover }))?.cover_image).toBe(cover);
    expect(parseArticleContent(JSON.stringify({ title: 'T', body: 'B', cover_image: null }))?.cover_image).toBeNull();
    expect(parseArticleContent(JSON.stringify({ title: 'T', body: 'B', cover_image: '' }))?.cover_image).toBeNull();
    expect(parseArticleContent(JSON.stringify({ title: 'T', body: 'B', cover_image: 42 }))?.cover_image).toBeNull();
  });
});

describe('isArticleContent', () => {
  it('returns true for a valid article envelope', () => {
    expect(isArticleContent(JSON.stringify({ title: 'Title', body: 'Body' }))).toBe(true);
  });

  it('returns false for malformed article content', () => {
    expect(isArticleContent('not valid json')).toBe(false);
    expect(isArticleContent(JSON.stringify({ title: 'Title' }))).toBe(false);
  });
});

describe('buildArticleContent', () => {
  it('round-trips through parseArticleContent, trimming both fields', () => {
    expect(parseArticleContent(buildArticleContent('  Title  ', '  Body  '))).toEqual({
      title: 'Title',
      body: 'Body',
      cover_image: null,
    });
  });
});

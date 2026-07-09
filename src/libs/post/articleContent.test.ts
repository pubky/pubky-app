import { describe, expect, it } from 'vitest';
import { isArticleContent, parseArticleContent } from './articleContent';

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

  it('parses a valid article envelope', () => {
    expect(parseArticleContent(JSON.stringify({ title: 'Title', body: 'Body', extra: true }))).toEqual({
      title: 'Title',
      body: 'Body',
    });
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

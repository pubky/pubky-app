import { describe, expect, it } from 'vitest';
import { getFirstLinkMatch, getFirstLinkUrl, getLinkUrls } from './postLinkUrl';

describe('getFirstLinkUrl', () => {
  it('returns the first URL when the content has several', () => {
    expect(getFirstLinkUrl('https://example.com then https://youtu.be/dQw4w9WgXcQ')).toBe('https://example.com');
  });

  it('adds http:// to a protocol-less link', () => {
    expect(getFirstLinkUrl('watch youtube.com/watch?v=dQw4w9WgXcQ now')).toBe('http://youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('skips a Markdown link and returns the next bare URL', () => {
    expect(getFirstLinkUrl('[a video](https://youtu.be/dQw4w9WgXcQ) and https://example.com/page')).toBe(
      'https://example.com/page',
    );
  });

  it('skips a Markdown link whose URL has nested parentheses', () => {
    expect(getFirstLinkUrl('[wiki](https://en.wikipedia.org/wiki/Foo_(bar)) only')).toBeNull();
  });

  it('ignores mailto: and ftp: links', () => {
    expect(getFirstLinkUrl('mail mailto:someone@example.com or ftp://files.example.com/a.mp4')).toBeNull();
  });

  it('leaves trailing punctuation out of the URL', () => {
    expect(getFirstLinkUrl('Look https://youtu.be/dQw4w9WgXcQ.')).toBe('https://youtu.be/dQw4w9WgXcQ');
  });

  it('keeps answers independent across calls on the shared parser', () => {
    expect(getFirstLinkUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(getFirstLinkUrl('no link here')).toBeNull();
    expect(getFirstLinkUrl('then https://example.com/next')).toBe('https://example.com/next');
    expect(getFirstLinkUrl('then https://example.com/next')).toBe('https://example.com/next');
  });

  it('returns null for content without a link', () => {
    expect(getFirstLinkUrl('just some words')).toBeNull();
    expect(getFirstLinkUrl('')).toBeNull();
  });
});

describe('getFirstLinkMatch', () => {
  it('returns the scheme the link was written with', () => {
    expect(getFirstLinkMatch('see https://example.com/a')).toEqual({ url: 'https://example.com/a', schema: 'https:' });
  });

  it('returns an empty scheme for a link written without one', () => {
    expect(getFirstLinkMatch('see example.com/a')).toEqual({ url: 'http://example.com/a', schema: '' });
  });

  it('returns null for content without a link', () => {
    expect(getFirstLinkMatch('just some words')).toBeNull();
  });
});

describe('getLinkUrls', () => {
  it('returns every link in order, Markdown link targets included', () => {
    expect(getLinkUrls('a https://a.example then [b](https://b.example) and c.com')).toEqual([
      'https://a.example',
      'https://b.example',
      'http://c.com',
    ]);
  });

  it('returns an empty list without links', () => {
    expect(getLinkUrls('just some words')).toEqual([]);
  });
});

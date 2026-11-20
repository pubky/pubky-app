import { describe, expect, it } from 'vitest';
import { getShownEmbedUrl, getWebEmbedUrl, normalizeEmbedUrl } from './postEmbedUrl';

describe('getWebEmbedUrl', () => {
  it.each(['https://en.wikipedia.org/wiki/Bitcoin', 'http://example.com/a?b=c#d'])('returns the web link %s', (url) => {
    expect(getWebEmbedUrl(url)).toBe(url);
  });

  it.each([
    null,
    undefined,
    '',
    'pubky://pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy/pub/social/v1/posts/0035QZPT4QG00',
    'isbn:9780140328721',
    'javascript:alert(1)',
    'data:text/html,hi',
    'HTTPS://example.com',
    ' https://example.com',
  ])('returns null for %s', (value) => {
    expect(getWebEmbedUrl(value)).toBeNull();
  });
});

describe('normalizeEmbedUrl', () => {
  it.each([
    ['HTTPS://Example.COM:443/Path?b=2&a=1#frag', 'https://example.com/Path?b=2&a=1'],
    ['https://example.com', 'https://example.com/'],
    ['http://user:pass@example.com:8080/x', 'http://example.com:8080/x'],
  ])('gives %s the comparison key %s', (url, normalized) => {
    expect(normalizeEmbedUrl(url)).toBe(normalized);
  });

  it('returns null for a value that is not a URL', () => {
    expect(normalizeEmbedUrl('not a url')).toBeNull();
  });
});

describe('getShownEmbedUrl', () => {
  const EMBED = 'https://a.example/page';

  it('returns the text link that Nexus normalized embed names, as written', () => {
    const written = 'https://Example.com/Page#top';
    expect(getShownEmbedUrl('https://example.com/Page', `first https://b.example/x then ${written}`)).toBe(written);
  });

  it.each([
    ['a bare host', 'https://example.com/', 'https://example.com'],
    ['an IDN host', 'https://xn--bcher-kva.de/x', 'https://Bücher.de/x'],
    ['percent encoding', 'https://example.com/Z%C3%BCrich', 'https://example.com/Zürich'],
  ])('matches %s as Nexus stores it to the text link as written', (_name, stored, written) => {
    expect(getShownEmbedUrl(stored, `Read ${written}`)).toBe(written);
  });

  it.each([`Read ${EMBED}`, `Read b.example first, then ${EMBED}`, `Read [this](${EMBED})`])(
    'returns the embed while the text holds its link: %s',
    (content) => {
      expect(getShownEmbedUrl(EMBED, content)).toBe(EMBED);
    },
  );

  it.each(['Read https://b.example/page', 'Read it later', `Read ${EMBED}/more`])(
    'returns null once the text no longer holds the link: %s',
    (content) => {
      expect(getShownEmbedUrl(EMBED, content)).toBeNull();
    },
  );

  it('returns the embed of a post without text', () => {
    expect(getShownEmbedUrl(EMBED, '  ')).toBe(EMBED);
  });

  it.each([null, undefined])('returns null without an embed (%s)', (embed) => {
    expect(getShownEmbedUrl(embed, `Read ${EMBED}`)).toBeNull();
  });
});

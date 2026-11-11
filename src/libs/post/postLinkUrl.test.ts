import { describe, expect, it } from 'vitest';
import { getEmbedLinkMatches, getFirstLinkMatch, getFirstLinkUrl, getLinkUrls, getUriUrls } from './postLinkUrl';

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

describe('getUriUrls', () => {
  it.each([
    ['isbn:9780141036144', 'isbn:9780141036144'],
    ['geo:47.3769,8.5417', 'geo:47.3769,8.5417'],
    [
      'btc:tx/3d365ba65953e39c2ff64186022fe9ccf4ac0694888d9bf0c57a45de23e46fd5',
      'btc:tx/3d365ba65953e39c2ff64186022fe9ccf4ac0694888d9bf0c57a45de23e46fd5',
    ],
    ['doi:10.1038/nature14539', 'doi:10.1038/nature14539'],
    ['urn:isbn:9780141036144', 'urn:isbn:9780141036144'],
    ['spotify:track:4uLU6hMCjMI75M1A2tKUQC', 'spotify:track:4uLU6hMCjMI75M1A2tKUQC'],
    [
      'ln:node/03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f',
      'ln:node/03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f',
    ],
    ['ISBN:9780141036144', 'isbn:9780141036144'],
  ])('finds %s in a sentence, its scheme in lower case', (written, uri) => {
    expect(getUriUrls(`Read ${written} today`)).toEqual([uri]);
  });

  it.each([
    ['Read isbn:9780141036144.', 'isbn:9780141036144'],
    ['Where? geo:47.3769,8.5417!', 'geo:47.3769,8.5417'],
    ['(see doi:10.1038/nature14539)', 'doi:10.1038/nature14539'],
    ['"isbn:9780141036144",', 'isbn:9780141036144'],
    ['urn:x-test:(a)b), then', 'urn:x-test:(a)b'],
    ['ends with a colon isbn:978:', 'isbn:978'],
  ])('trims the punctuation around it: %s', (content, uri) => {
    expect(getUriUrls(content)).toEqual([uri]);
  });

  it.each([
    'Meet at 10:30 tomorrow',
    'Saved in C:\\Users\\gil',
    'x:1 is a one-letter scheme',
    'a label: then a space',
    'ab:.',
  ])('finds nothing in %s', (content) => {
    expect(getUriUrls(content)).toEqual([]);
  });

  it('reads Markdown link targets too', () => {
    expect(getUriUrls('a [book](isbn:9780141036144) and geo:1,2')).toEqual(['isbn:9780141036144', 'geo:1,2']);
  });
});

describe('getEmbedLinkMatches', () => {
  const anyUri = () => true;

  it('lists web links and other URIs in text order, with their schemes', () => {
    expect(getEmbedLinkMatches('isbn:9780141036144 then https://a.example/x and example.org, geo:1,2', anyUri)).toEqual(
      [
        { url: 'isbn:9780141036144', schema: 'isbn:' },
        { url: 'https://a.example/x', schema: 'https:' },
        { url: 'http://example.org', schema: '' },
        { url: 'geo:1,2', schema: 'geo:' },
      ],
    );
  });

  it('leaves out Markdown link targets', () => {
    expect(getEmbedLinkMatches('[book](isbn:978) and [site](https://a.example)', anyUri)).toEqual([]);
  });

  it.each([
    'Note:this is prose',
    'ISBN:9780141036144',
    'call std::move here',
    'run it on example.com:8080/x',
    'serve on localhost:3000',
    'cache in redis:6379/0',
    'https://example.com/a?isbn:1 HTTPS://Example.com',
    'Saved in C:\\Users\\gil at 10:30',
  ])('reads no URI in %s', (content) => {
    expect(getEmbedLinkMatches(content, anyUri).filter(({ schema }) => schema.toLowerCase() !== 'https:')).toEqual([]);
  });

  it('leaves out a URI `isUri` refuses, as linkify does, so a later link stays first', () => {
    expect(getEmbedLinkMatches('ftp://x.org/a.zip then https://a.example/x', (uri) => !uri.startsWith('ftp:'))).toEqual(
      [{ url: 'https://a.example/x', schema: 'https:' }],
    );
  });

  it('keeps a web link a prose prefix runs into', () => {
    expect(getEmbedLinkMatches('source:https://a.example/x', anyUri)).toEqual([
      { url: 'https://a.example/x', schema: 'https:' },
    ]);
  });

  it.each([
    'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a&dn=archive.org',
    'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a&tr=https://tracker.example/announce',
  ])('keeps a link found inside a URI part of the URI: %s', (magnet) => {
    expect(getEmbedLinkMatches(`get ${magnet} now`, anyUri)).toEqual([{ url: magnet, schema: 'magnet:' }]);
  });
});

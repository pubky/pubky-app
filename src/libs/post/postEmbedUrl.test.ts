import { limits } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import {
  getComposerEmbedUrl,
  getComposerEmbedUrls,
  getEditEmbedSeed,
  getShownEmbedUrl,
  getWebEmbedUrl,
  normalizeEmbedUrl,
} from './postEmbedUrl';

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

describe('getComposerEmbedUrl', () => {
  it('returns the first link of the text', () => {
    expect(getComposerEmbedUrl('Read https://en.wikipedia.org/wiki/Bitcoin and https://luma.com/376whqyw')).toBe(
      'https://en.wikipedia.org/wiki/Bitcoin',
    );
  });

  it.each(['see example.com/page', 'see en.wikipedia.org/wiki/Bitcoin and https://luma.com/376whqyw'])(
    'returns null when the first link is written without a scheme: %s',
    (content) => {
      expect(getComposerEmbedUrl(content)).toBeNull();
    },
  );

  it.each(['HTTPS://example.com/page', 'see //example.com/page'])('returns null for %s', (content) => {
    expect(getComposerEmbedUrl(content)).toBeNull();
  });

  it('returns null without a link', () => {
    expect(getComposerEmbedUrl('no links here')).toBeNull();
  });

  it('returns null for a link to this app', () => {
    expect(getComposerEmbedUrl(`look ${window.location.origin}/post/abc/123`)).toBeNull();
  });

  it('returns null for a link longer than the data model stores', () => {
    const url = `https://example.com/${'a'.repeat(limits.referenceUriMaxLength)}`;
    expect(getComposerEmbedUrl(url)).toBeNull();
  });
});

describe('getComposerEmbedUrls', () => {
  it('returns every embeddable link of the text in order, each once', () => {
    expect(
      getComposerEmbedUrls(
        'https://a.example/1 and example.org/2, https://c.example/3 [md](https://d.example/4) https://a.example/1',
      ),
    ).toEqual(['https://a.example/1', 'https://c.example/3']);
  });

  it('leaves out links to this app and links longer than the data model stores', () => {
    const long = `https://example.com/${'a'.repeat(limits.referenceUriMaxLength)}`;
    expect(getComposerEmbedUrls(`https://e.example/5 ${window.location.origin}/post/abc/123 ${long}`)).toEqual([
      'https://e.example/5',
    ]);
  });

  it('returns nothing without a link', () => {
    expect(getComposerEmbedUrls('no links here')).toEqual([]);
  });

  it.each([
    '(what about https://a.example/x?) or https://b.example/y',
    'He wrote "https://a.example/x." and https://b.example/y',
  ])('starts with the link getComposerEmbedUrl embeds, as the text writes it: %s', (content) => {
    expect(getComposerEmbedUrls(content)[0]).toBe(getComposerEmbedUrl(content));
  });

  it('keeps a later link as the text writes it', () => {
    expect(getComposerEmbedUrls('Read https://b.example/y (see https://a.example/x.)')[1]).toBe(
      getComposerEmbedUrl('(see https://a.example/x.)'),
    );
  });

  it('counts two spellings of one link once, under the first spelling', () => {
    expect(
      getComposerEmbedUrls(
        'https://a.example/x#one https://A.example:443/x#two https://example.com https://example.com/',
      ),
    ).toEqual(['https://a.example/x#one', 'https://example.com']);
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

describe('getEditEmbedSeed', () => {
  const LINK = 'https://en.wikipedia.org/wiki/Bitcoin';
  const LUMA = 'https://luma.com/376whqyw';

  it('opens on the text spelling of the stored embed', () => {
    expect(getEditEmbedSeed(`Read ${LINK} and ${LUMA}#event`, LUMA)).toEqual({
      opened: `${LUMA}#event`,
      removed: null,
    });
  });

  it('opens on none when the text does not offer the stored embed', () => {
    expect(getEditEmbedSeed(`Read ${LINK}`, LUMA)).toEqual({ opened: null, removed: null });
    expect(getEditEmbedSeed(`see example.com/x and ${LUMA}`, LUMA)).toEqual({ opened: null, removed: null });
  });

  it('starts a post that embeds none with its first link removed', () => {
    expect(getEditEmbedSeed(`Read ${LINK} and ${LUMA}`, null)).toEqual({ opened: null, removed: LINK });
    expect(getEditEmbedSeed('no links', null)).toEqual({ opened: null, removed: null });
  });
});

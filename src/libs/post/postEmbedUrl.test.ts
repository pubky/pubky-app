import { buildPost, limits } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import {
  getComposerEmbedUrl,
  getComposerEmbedUrls,
  getEditEmbedSeed,
  getResourceEmbedUrl,
  getShownEmbedUrl,
  getUriEmbedUrl,
  getWebEmbedUrl,
  normalizeEmbedUrl,
} from './postEmbedUrl';

const ISBN = 'isbn:9780141036144';
const GEO = 'geo:47.3769,8.5417';
const BTC_TX = 'btc:tx/3d365ba65953e39c2ff64186022fe9ccf4ac0694888d9bf0c57a45de23e46fd5';
const DOI = 'doi:10.1038/nature14539';
const MAGNET = 'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a';

/** Whether the data model stores `embed` (`buildPost` from pubky-social-specs). */
const isStored = (embed: string) => {
  try {
    return buildPost(fakeOwner(1), { content: 'x', embed }).object.embed === embed;
  } catch {
    return false;
  }
};

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

describe('getUriEmbedUrl', () => {
  const ACCEPTED = [
    ISBN,
    GEO,
    BTC_TX,
    DOI,
    MAGNET,
    'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
    'urn:isbn:9780141036144',
    'ln:node/03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f',
    'mailto:a@b.c',
  ];

  it.each(ACCEPTED)('returns the URI %s, which the data model stores', (uri) => {
    expect(getUriEmbedUrl(uri)).toBe(uri);
    expect(isStored(uri)).toBe(true);
  });

  it.each([
    ['not a URI', 'not a uri'],
    ['an upper-case scheme (not canonical)', 'ISBN:9780141036144'],
    ['a one-letter scheme', 'c:/Users'],
    ['nothing after the colon', 'isbn:'],
    ['a space', 'isbn:978 0141036144'],
    ['a control character', 'isbn:978\u0000'],
    ['a web link (getWebEmbedUrl)', 'https://example.com'],
    ['a non-canonical web link', 'HTTPS://Example.com'],
    [
      'a Pubky reference',
      'pubky://pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy/pub/social/v1/posts/0035QZPT4QG00',
    ],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,hi'],
    ['vbscript:', 'vbscript:msgbox(1)'],
    ['file:', 'file:///etc/passwd'],
    ['blob:', 'blob:https://example.com/0f6a'],
    ['about:', 'about:blank'],
    ['filesystem:', 'filesystem:https://example.com/temporary/a'],
    ['view-source:', 'view-source:https://example.com'],
    ['a legacy pk: mention', 'pk:o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo'],
    ['a URI longer than the data model stores', `urn:x:${'a'.repeat(limits.referenceUriMaxLength)}`],
  ])('returns null for %s', (_name, value) => {
    expect(getUriEmbedUrl(value)).toBeNull();
  });

  it.each([null, undefined, ''])('returns null for %s', (value) => {
    expect(getUriEmbedUrl(value)).toBeNull();
  });

  it('refuses the unsafe schemes the data model would store', () => {
    expect(isStored('javascript:alert(1)')).toBe(true);
    expect(getUriEmbedUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('getResourceEmbedUrl', () => {
  it.each(['https://en.wikipedia.org/wiki/Bitcoin', ISBN, GEO])('returns the external resource %s', (embed) => {
    expect(getResourceEmbedUrl(embed)).toBe(embed);
  });

  it.each([
    null,
    'pubky://pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy/pub/social/v1/posts/0035QZPT4QG00',
    'javascript:alert(1)',
    'HTTPS://example.com',
  ])('returns null for %s', (embed) => {
    expect(getResourceEmbedUrl(embed)).toBeNull();
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

  it.each([
    [`Reading ${ISBN}.`, ISBN],
    [`Lunch at ${GEO}, then https://luma.com/376whqyw`, GEO],
    [`Paid in ${BTC_TX}`, BTC_TX],
    [`(${DOI})`, DOI],
    [`Get it: ${MAGNET}`, MAGNET],
  ])('returns a URI of another scheme written first in the text: %s', (content, uri) => {
    expect(getComposerEmbedUrl(content)).toBe(uri);
  });

  it.each([
    'Meet at 10:30',
    'Note:this is prose',
    'mail me: mailto:a@b.com',
    'or a@b.com',
    'ftp://files.example.com/a.zip',
    'javascript:alert(1)',
    'data:text/html,hi',
    'pubky://pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy/pub/social/v1/posts/0035QZPT4QG00',
    'gm pk:o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
    'call me: tel:+41441234567',
    'serve on localhost:3000',
  ])('offers nothing for %s', (content) => {
    expect(getComposerEmbedUrl(content)).toBeNull();
  });

  it.each([
    'ftp://x.org/a.zip',
    'mailto:a@b.com',
    'tel:+41441234567',
    'pubky://pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy/pub/social/v1/posts/0035QZPT4QG00',
    'pk:o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
    'javascript:alert(1)',
    'data:text/html,hi',
    `urn:x:${'a'.repeat(limits.referenceUriMaxLength)}`,
  ])('still embeds a web link after a URI it does not offer: %s', (token) => {
    expect(getComposerEmbedUrl(`${token} https://example.com`)).toBe('https://example.com');
  });

  it('keeps the plain preview of a text that opens with a link written without a scheme', () => {
    expect(getComposerEmbedUrl(`see example.com/page and ${ISBN}`)).toBeNull();
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

  it('lists web links and URIs of other schemes in text order, each once', () => {
    expect(
      getComposerEmbedUrls(`${ISBN} or https://a.example/1, javascript:alert(1) ${GEO} mailto:a@b.c ${ISBN}.`),
    ).toEqual([ISBN, 'https://a.example/1', GEO]);
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
    expect(getShownEmbedUrl(ISBN, '')).toBe(ISBN);
  });

  it.each([`Reading ${ISBN}.`, `A [book](${ISBN})`])('returns a URI embed while the text holds it: %s', (content) => {
    expect(getShownEmbedUrl(ISBN, content)).toBe(ISBN);
  });

  it('returns a URI embed the text writes with an upper-case scheme', () => {
    expect(getShownEmbedUrl(ISBN, 'Reading ISBN:9780141036144')).toBe(ISBN);
  });

  it.each(['Reading isbn:9780141036145', `Reading ${ISBN}0`, 'Reading it'])(
    'returns null once the text no longer holds the URI: %s',
    (content) => {
      expect(getShownEmbedUrl(ISBN, content)).toBeNull();
    },
  );

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
    expect(getEditEmbedSeed(`Read ${ISBN} and ${LINK}`, null)).toEqual({ opened: null, removed: ISBN });
  });

  it('opens on a stored URI of another scheme the text holds', () => {
    expect(getEditEmbedSeed(`Read ${LINK} and ${ISBN}.`, ISBN)).toEqual({ opened: ISBN, removed: null });
    expect(getEditEmbedSeed(`Read ${LINK}`, ISBN)).toEqual({ opened: null, removed: null });
  });
});

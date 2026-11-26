import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { foldWebLink } from './externalParent';
import { getIdentifierPage, getTrackedLinksAsTyped, removeTracking, removeTrackingInText } from './linkRules';
import rules from './linkRules.data.json';

describe('linkRules.data.json', () => {
  it('is the generated module of one Pinakes version, unedited', () => {
    expect(rules.spelling_rules).toMatch(/^[0-9a-f]{16}$/);
    expect(rules.source).toMatch(/^[0-9a-f]{40}$/);
    const data = { tracking: rules.tracking, pages: rules.pages, tracking_vectors: rules.tracking_vectors };
    expect(createHash('sha256').update(JSON.stringify(data)).digest('hex')).toBe(rules.sha256);
  });
});

describe('removeTracking', () => {
  it('folds every tracking vector Pinakes publishes to its root', () => {
    expect(rules.tracking_vectors.length).toBeGreaterThan(0);
    for (const { link, root } of rules.tracking_vectors) {
      expect(foldWebLink(removeTracking(link)), link).toBe(foldWebLink(root));
    }
  });

  it('drops each listed parameter where it tracks and keeps a host-scoped one elsewhere', () => {
    for (const t of rules.tracking) {
      const name = t.match === 'prefix' ? `${t.param}campaign` : t.param;
      for (const host of [...t.hosts, 'example.org']) {
        const link = `https://sub.${host}/a/b?keep=1&${name}=x#top`;
        const expected = t.hosts.length === 0 || host !== 'example.org' ? `https://sub.${host}/a/b?keep=1#top` : link;
        expect(removeTracking(link), link).toBe(expected);
      }
    }
  });

  it('keeps every other parameter in its place and encoding, and drops an empty query', () => {
    expect(removeTracking('https://example.org/s?q=%E9&utm_source=x&b=a%20b')).toBe(
      'https://example.org/s?q=%E9&b=a%20b',
    );
    expect(removeTracking('https://open.spotify.com/track/6LgJvl0Xdtc73RJ1mmpotq?si=4f1e2d3c')).toBe(
      'https://open.spotify.com/track/6LgJvl0Xdtc73RJ1mmpotq',
    );
    expect(removeTracking('https://example.org/a?%75tm_source=x')).toBe('https://example.org/a');
  });

  it('leaves a link without them, a non-web URI and text as they are', () => {
    for (const value of [
      'https://example.org/a?id=7',
      'https://netflix.com/watch?s=1&t=2',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42',
      'https://example.org/a?UTM_SOURCE=x',
      'isbn:9780140328721',
      'not a link ?utm_source=x',
    ]) {
      expect(removeTracking(value)).toBe(value);
    }
  });
});

describe('removeTrackingInText', () => {
  it('cleans every link in the text and nothing else', () => {
    expect(
      removeTrackingInText(
        'Listen https://open.spotify.com/track/6LgJvl0Xdtc73RJ1mmpotq?si=abc and [read](https://example.org/a?id=1&fbclid=z) or example.com/b?utm_source=x.',
      ),
    ).toBe(
      'Listen https://open.spotify.com/track/6LgJvl0Xdtc73RJ1mmpotq and [read](https://example.org/a?id=1) or example.com/b.',
    );
  });

  it('leaves a query in the fragment alone', () => {
    expect(removeTrackingInText('https://app.example/#/page?utm_source=x')).toBe(
      'https://app.example/#/page?utm_source=x',
    );
    expect(removeTracking('https://a.example/p?utm_source=x#frag?utm_medium=y')).toBe(
      'https://a.example/p#frag?utm_medium=y',
    );
  });

  it('keeps closing punctuation after a link where it was', () => {
    expect(removeTrackingInText(`see (${'https://example.org/a?utm_source=x'}.) now`)).toBe(
      'see (https://example.org/a.) now',
    );
  });

  it('returns the same string when no link carries a tracking parameter', () => {
    const text = 'see https://example.org/a?id=7 and ?utm_source=x';
    expect(removeTrackingInText(text)).toBe(text);
  });
});

describe('getIdentifierPage', () => {
  it('answers every identifier page Pinakes publishes', () => {
    expect(rules.pages.length).toBeGreaterThan(0);
    for (const { id, page } of rules.pages) {
      expect(getIdentifierPage(id), id).toBe(page);
    }
  });

  it('has no page for an identifier without one, or for a web link', () => {
    for (const id of [
      'mbid:b1a9c0e9-d987-4042-ae91-78d6a3267d69',
      'imdb:tt0111161',
      'upc:0602527347520',
      'gtin:4006381333931',
      'podcast:guid:917393e3-1b1e-5cef-ace4-edaa54e1f810',
      'https://www.wikidata.org/wiki/Q42',
      'isbn:9780140328722',
      'doi:',
      'commons:File:a.jpg',
      'commons:File:A b.jpg',
      'commons:File:A%2Fb.jpg',
      'commons:File:A#b.jpg',
      'docker:library/nginx.',
      `ia:${'a'.repeat(101)}`,
      'usgs:US7000ABCD',
      '',
    ]) {
      expect(getIdentifierPage(id), id).toBeNull();
    }
  });
});

describe('commons pages', () => {
  it('writes the page as MediaWiki does, for the root as Pinakes writes it', () => {
    expect(getIdentifierPage("commons:File:Van_Gogh's_Starry_Night.jpg")).toBe(
      'https://commons.wikimedia.org/wiki/File:Van_Gogh%27s_Starry_Night.jpg',
    );
    expect(getIdentifierPage('commons:File:Who?.jpg')).toBe('https://commons.wikimedia.org/wiki/File:Who%3F.jpg');
    expect(getIdentifierPage('commons:File:Caf%C3%A9_&_bar.jpg')).toBe(
      'https://commons.wikimedia.org/wiki/File:Caf%C3%A9_%26_bar.jpg',
    );
    expect(getIdentifierPage('commons:File:100%.jpg')).toBe('https://commons.wikimedia.org/wiki/File:100%25.jpg');
    // Not the form Pinakes writes: non-ASCII left raw, `"` after `?` left raw.
    expect(getIdentifierPage('commons:File:Café.jpg')).toBeNull();
    expect(getIdentifierPage('commons:File:A?"b".jpg')).toBeNull();
  });
});

describe('getTrackedLinksAsTyped', () => {
  const LINK = 'https://open.spotify.com/track/6LgJvl0Xdtc73RJ1mmpotq';
  const tracked = `${LINK}?si=abc`;

  it('finds a pasted link at once', () => {
    const value = `Listen ${tracked} now`;
    expect(getTrackedLinksAsTyped('Listen  now', value, `Listen ${tracked}`.length)).toEqual([
      { index: 7, lastIndex: 7 + tracked.length, clean: LINK },
    ]);
  });

  it('finds a pasted link that replaces a longer selection', () => {
    const previous = 'Listen https://example.com/a-much-longer-old-link-than-the-new-one-is-ok now';
    const value = `Listen ${tracked} now`;
    expect(getTrackedLinksAsTyped(previous, value, `Listen ${tracked}`.length)).toEqual([
      { index: 7, lastIndex: 7 + tracked.length, clean: LINK },
    ]);
  });

  it('finds a typed link once a space or line break ends it, not before', () => {
    expect(getTrackedLinksAsTyped(tracked.slice(0, -1), tracked, tracked.length)).toEqual([]);
    expect(getTrackedLinksAsTyped(tracked, `${tracked} `, tracked.length + 1)).toEqual([
      { index: 0, lastIndex: tracked.length, clean: LINK },
    ]);
    expect(getTrackedLinksAsTyped(tracked, `${tracked}\n`, tracked.length + 1)).toHaveLength(1);
  });

  it('leaves a link pasted right in front of a word until a space ends it', () => {
    const value = `see ${tracked}here now`;
    expect(getTrackedLinksAsTyped('see here now', value, `see ${tracked}`.length)).toEqual([]);
    const spaced = `see ${tracked} here now`;
    expect(getTrackedLinksAsTyped(value, spaced, `see ${tracked} `.length)).toEqual([
      { index: 4, lastIndex: 4 + tracked.length, clean: LINK },
    ]);
  });

  it('cleans a link pasted inside closing punctuation, which stays', () => {
    const pasted = 'https://a.com/?utm_source=x';
    const value = `see (${pasted}.)`;
    const links = getTrackedLinksAsTyped('see (.)', value, `see (${pasted}`.length);
    expect(links).toHaveLength(1);
    const [{ index, lastIndex, clean }] = links;
    expect(value.slice(0, index) + clean + value.slice(lastIndex)).toBe('see (https://a.com/.)');
  });

  it('finds a typed link that closing punctuation and a space end', () => {
    for (const end of ['. ', ', ', ') ', '.)\n']) {
      const value = `(${tracked}${end}`;
      const links = getTrackedLinksAsTyped(value.slice(0, -1), value, value.length);
      expect(links, end).toHaveLength(1);
      const [{ index, lastIndex, clean }] = links;
      expect(value.slice(0, index) + clean + value.slice(lastIndex), end).toBe(`(${LINK}${end}`);
    }
  });

  it('leaves links the change did not touch alone', () => {
    const previous = `${tracked} and`;
    expect(getTrackedLinksAsTyped(previous, `${previous} `, previous.length + 1)).toEqual([]);
    expect(getTrackedLinksAsTyped('', `${LINK} `, LINK.length + 1)).toEqual([]);
    // Deleting after a link is no new end of it.
    expect(getTrackedLinksAsTyped(`${tracked} x`, `${tracked} `, tracked.length + 1)).toEqual([]);
  });

  it('lists several pasted links last first', () => {
    const value = `${tracked} ${tracked}`;
    expect(getTrackedLinksAsTyped('', value, value.length).map((l) => l.index)).toEqual([tracked.length + 1, 0]);
  });
});

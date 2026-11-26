import { describe, expect, it } from 'vitest';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import missingFixture from '@/services/pinakes/fixtures/by-uri.missing.json';
import natureArticleFixture from '@/services/pinakes/fixtures/by-uri.nature-article.json';
import scholarlyArticleFixture from '@/services/pinakes/fixtures/by-uri.scholarly-article.json';
import unreachableFixture from '@/services/pinakes/fixtures/by-uri.unreachable.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import relatedFixture from '@/services/pinakes/fixtures/search.related.json';
import typeFacetFixture from '@/services/pinakes/fixtures/search.type-facet.json';
import { PinakesStatus, type TPinakesCard, type TPinakesTypeFacet } from '@/services/pinakes/pinakes.types';
import { ResourceFamily } from './ResourceCard.types';
import {
  formatResourceDates,
  formatResourcePoint,
  getAlsoOnIdentifier,
  getAlsoOnName,
  getAlsoOnNote,
  getDisplayLink,
  getEventStatusNote,
  getFaviconUrl,
  getHttpUrl,
  getLinkHost,
  getPubkyObjectApp,
  getResourceFamily,
  getResourceLinks,
  getResourceListNote,
  getResourceStatus,
  getResourceTagsLabel,
  getResourceTarget,
  getResourceTypeLabel,
  hasWideImage,
  isCardSurfaceClick,
  isWritableResourceUri,
  MAX_LINK_SPELLINGS,
  playsInCard,
} from './ResourceCard.utils';

const TYPE_FACETS: TPinakesTypeFacet[] = typeFacetFixture.facets.type;

// Intl separates times and ranges with narrow and thin no-break spaces; compare them as plain spaces.
const plain = (value: string | null) => value?.replace(/\s/g, ' ') ?? null;

const labelOf = (type: string) => getResourceTypeLabel({ type, type_path: [] });

describe('getResourceTypeLabel', () => {
  it.each([
    ['ScholarlyArticle', 'Scholarly article'],
    ['PodcastSeries', 'Podcast series'],
    ['City', 'City'],
    ['WebPage', 'Web page'],
    ['VideoObject', 'Video'],
    ['ImageObject', 'Image'],
    ['FAQPage', 'FAQ page'],
    ['CafeOrCoffeeShop', 'Cafe or coffee shop'],
    ['DiscussionForumPosting', 'Discussion forum posting'],
  ])('reads %s as "%s"', (type, label) => {
    expect(labelOf(type)).toBe(label);
  });

  it.each([
    ['MusicRecording', 'Song'],
    ['MusicAlbum', 'Album'],
    ['MusicGroup', 'Artist'],
    ['Movie', 'Movie'],
    ['TVSeries', 'TV series'],
  ])('reads %s as the plain word "%s"', (type, label) => {
    expect(labelOf(type)).toBe(label);
  });

  it('reads the plain word from the deepest type_path entry when the card has no type', () => {
    expect(getResourceTypeLabel({ type: null, type_path: ['Thing', 'CreativeWork', 'MusicRecording'] })).toBe('Song');
  });

  it('reads a type named like a built-in object property in words', () => {
    expect(labelOf('constructor')).toBe('constructor');
    expect(getResourceTagsLabel({ type: 'toString', type_path: [] })).toBe('Tags on this to string');
  });

  it('gives every type in the Pinakes type facets a label in plain words', () => {
    for (const facet of TYPE_FACETS) {
      const label = getResourceTypeLabel(facet);
      expect(label, facet.type).toMatch(/^[A-Z][A-Za-z]*( [a-z]+| [A-Z]+)*$/);
    }
  });

  it('falls back to the deepest type_path entry when the card has no type', () => {
    expect(getResourceTypeLabel({ type: null, type_path: ['Thing', 'CreativeWork', 'Book'] })).toBe('Book');
  });

  it('has no label when the card has no type at all', () => {
    expect(getResourceTypeLabel({ type: null, type_path: [] })).toBeNull();
  });
});

describe('getResourceFamily', () => {
  it('places every event type in the Pinakes type facets in the event family', () => {
    const events = TYPE_FACETS.filter((facet) => facet.type_path.includes('Event'));
    expect(events.map((facet) => facet.type)).toEqual(expect.arrayContaining(['Event', 'MusicEvent']));
    for (const facet of events) expect(getResourceFamily(facet), facet.type).toBe(ResourceFamily.EVENT);
  });

  it('places every place type in the Pinakes type facets in the place family, through any depth', () => {
    const places = TYPE_FACETS.filter((facet) => facet.type_path.includes('Place'));
    expect(places.map((facet) => facet.type)).toEqual(expect.arrayContaining(['City', 'Restaurant', 'Mountain']));
    for (const facet of places) expect(getResourceFamily(facet), facet.type).toBe(ResourceFamily.PLACE);
  });

  it('makes every other type a plain web card', () => {
    const others = TYPE_FACETS.filter(
      (facet) => !facet.type_path.includes('Event') && !facet.type_path.includes('Place'),
    );
    expect(others.length).toBeGreaterThan(0);
    for (const facet of others) expect(getResourceFamily(facet), facet.type).toBe(ResourceFamily.WEB);
  });

  it('uses the nearest known ancestor of a type it has never seen', () => {
    expect(getResourceFamily({ type: 'JazzFestival', type_path: ['Thing', 'Event', 'Festival', 'JazzFestival'] })).toBe(
      ResourceFamily.EVENT,
    );
  });

  it('falls back to a web card for a type with no known ancestor', () => {
    expect(getResourceFamily({ type: 'Gadget', type_path: [] })).toBe(ResourceFamily.WEB);
  });
});

describe('getResourceStatus', () => {
  it.each(Object.values(PinakesStatus))('keeps the documented status %s', (status) => {
    expect(getResourceStatus(status)).toBe(status);
  });

  it('reads a status added after this client as error', () => {
    expect(getResourceStatus('archived')).toBe(PinakesStatus.ERROR);
  });
});

describe('getHttpUrl', () => {
  it.each([
    'https://example.com/a',
    'http://www.dancarlin.com/graphics/DC_HH_iTunes.jpg',
    'https://example.invalid/@alice',
    'https://example.invalid/a?by=alice@example.invalid',
  ])('keeps %s', (url) => {
    expect(getHttpUrl(url)).toBe(url);
  });

  it.each([
    'isbn:9780140328721',
    'doi:10.1038/nature12373',
    'pubky://yjn8k7ww4sc4hskkmbcsep6b1xje8g4f8j3azpdqnwhhqckt7kso/pub/loopky/decks/p2uuj5jo5ln2/manifest.json',
    'geo:52.5,13.4',
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'mailto:someone@example.com',
    'https://alice@example.invalid/a',
    'https://alice:secret@example.invalid/a',
    'https://:secret@example.invalid/a',
    'https://alice%40home:s%3Acret@example.invalid/a',
    'not a url',
    '',
    null,
    undefined,
  ])('refuses %s', (value) => {
    expect(getHttpUrl(value)).toBeNull();
  });
});

describe('isWritableResourceUri', () => {
  it.each(['https://example.com/a?next=x@y', 'https://example.com/@someone', 'isbn:9780140328721'])(
    'writes %s',
    (uri) => {
      expect(isWritableResourceUri(uri)).toBe(true);
    },
  );

  it.each(['https://user:secret@example.com/a', 'http://user@example.com', 'javascript:alert(1)', 'pubky://someone'])(
    'does not write %s',
    (uri) => {
      expect(isWritableResourceUri(uri)).toBe(false);
    },
  );
});

describe('link helpers', () => {
  it('shows a link without its scheme and www.', () => {
    expect(getDisplayLink('https://www.binance.com/')).toBe('binance.com/');
    expect(getDisplayLink('isbn:9780140328721')).toBe('9780140328721');
  });

  it('reads the host of a web link only', () => {
    expect(getLinkHost('https://www.openstreetmap.org/node/240109189')).toBe('openstreetmap.org');
    expect(getLinkHost('doi:10.1038/nature12373')).toBeNull();
  });

  it('asks a web link’s own host for its favicon over https, and nothing else', () => {
    expect(getFaviconUrl('https://en.wikipedia.org/wiki/Bitcoin')).toBe('https://en.wikipedia.org/favicon.ico');
    // An `http:` image on the app's `https:` page would be mixed content.
    expect(getFaviconUrl('http://nrs.harvard.edu/urn-3:HUL.InstRepos:12285462')).toBe(
      'https://nrs.harvard.edu/favicon.ico',
    );
    expect(getFaviconUrl('isbn:9780140328721')).toBeNull();
    expect(getFaviconUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('formatResourceDates', () => {
  it('shows the event in its own time zone, with the zone named', () => {
    expect(plain(formatResourceDates(eventFixture, 'en-US'))).toBe(
      'Oct 28, 2026, 2:00 PM CDT – Oct 30, 2026, 12:30 PM CDT',
    );
  });

  it('follows the viewer’s locale', () => {
    expect(plain(formatResourceDates(eventFixture, 'de-DE'))).toContain('28. Okt. 2026');
  });

  it('shows the start alone without an end', () => {
    expect(plain(formatResourceDates({ ...eventFixture, end: null }, 'en-US'))).toBe('Oct 28, 2026, 2:00 PM CDT');
  });

  it('shows an all-day event of one day as its date', () => {
    const holiday = { start: '2026-12-24T00:00:00Z', end: '2026-12-25T00:00:00Z', tz: null, all_day: true };
    expect(plain(formatResourceDates(holiday, 'en-US'))).toBe('Dec 24, 2026');
  });

  it('shows a longer all-day event as a range of dates, its end exclusive', () => {
    const festival = { start: '2026-12-24T00:00:00Z', end: '2026-12-27T00:00:00Z', tz: null, all_day: true };
    expect(plain(formatResourceDates(festival, 'en-US'))).toBe('Dec 24 – 26, 2026');
  });

  it('keeps an all-day date on its day in a time zone west of UTC', () => {
    const holiday = {
      start: '2026-12-24T00:00:00Z',
      end: '2026-12-25T00:00:00Z',
      tz: 'America/Los_Angeles',
      all_day: true,
    };
    expect(plain(formatResourceDates(holiday, 'en-US'))).toBe('Dec 24, 2026');
  });

  it('shows an event without a time zone in UTC and says so, never silently in the viewer’s own zone', () => {
    const concert = { start: '2026-11-16T19:00:00Z', end: '2026-11-16T23:00:00Z' };
    expect(plain(formatResourceDates(concert, 'en-US'))).toBe('Nov 16, 2026, 7:00 – 11:00 PM UTC');
    expect(plain(formatResourceDates({ ...concert, end: null, tz: null }, 'en-US'))).toBe('Nov 16, 2026, 7:00 PM UTC');
  });

  it('shows a time zone it does not know in UTC too, named', () => {
    expect(plain(formatResourceDates({ ...eventFixture, end: null, tz: 'Not/AZone' }, 'en-US'))).toBe(
      'Oct 28, 2026, 7:00 PM UTC',
    );
  });

  it('shows nothing without a valid start', () => {
    expect(formatResourceDates({ start: null, end: null }, 'en-US')).toBeNull();
    expect(formatResourceDates({ start: 'soon', end: null }, 'en-US')).toBeNull();
  });
});

describe('getEventStatusNote', () => {
  it('says nothing for an event going ahead or without a status', () => {
    expect(getEventStatusNote('scheduled')).toBeNull();
    expect(getEventStatusNote(null)).toBeNull();
    expect(getEventStatusNote(' ')).toBeNull();
  });

  it('says a lifecycle Pinakes names in words, as a calendar’s list of dates does', () => {
    expect(getEventStatusNote('cancelled')).toBe('Cancelled');
    expect(getEventStatusNote('moved_online')).toBe('Moved online');
    expect(getEventStatusNote('Rescheduled')).toBe('Rescheduled');
  });

  it('shows any other status as written', () => {
    expect(getEventStatusNote('EventPostponed')).toBe('Event status: EventPostponed');
    expect(getEventStatusNote('sold out')).toBe('Event status: sold out');
  });
});

describe('getResourceLinks', () => {
  it('links the post’s link and names the card’s own site, read from the card’s own link', () => {
    expect(getResourceLinks(videoFixture, 'https://youtu.be/dQw4w9WgXcQ')).toEqual({
      linkUrl: 'https://youtu.be/dQw4w9WgXcQ',
      sourceUri: videoFixture.uri,
      siteName: 'YouTube',
    });
  });

  it('falls back to the card’s link, then its host as the site', () => {
    expect(getResourceLinks({ ...eventFixture, site: null })).toEqual({
      linkUrl: eventFixture.uri,
      sourceUri: eventFixture.uri,
      siteName: 'luma.com',
    });
  });

  it('never links a non-web URI', () => {
    expect(
      getResourceLinks({ uri: 'isbn:9780140328721', site: null, open_in: [], refs: ['isbn:9780140328721'] }),
    ).toEqual({
      linkUrl: null,
      sourceUri: 'isbn:9780140328721',
      siteName: null,
    });
  });

  const BTC_BLOCK = {
    uri: 'btc:block/0000000000000000000029eb73ea7fbb1e1706781d5db0259f0c3df42f26614a',
    site: 'mempool.space',
    open_in: [],
    refs: ['https://mempool.space/block/0000000000000000000029eb73ea7fbb1e1706781d5db0259f0c3df42f26614a'],
  };

  it('links a card whose own link is not a web link to the first web link people wrote for it', () => {
    expect(getResourceLinks(BTC_BLOCK)).toEqual({
      linkUrl: BTC_BLOCK.refs[0],
      sourceUri: BTC_BLOCK.refs[0],
      siteName: 'mempool.space',
    });
    expect(
      getResourceLinks({
        uri: 'isbn:9780140328721',
        site: null,
        open_in: [],
        refs: ['isbn:9780140328721', 'https://openlibrary.org/isbn/9780140328721', 'https://example.org/b'],
      }),
    ).toEqual({
      linkUrl: 'https://openlibrary.org/isbn/9780140328721',
      sourceUri: 'https://openlibrary.org/isbn/9780140328721',
      siteName: 'openlibrary.org',
    });
  });

  it('still prefers the post’s link and the card’s own web link over its refs', () => {
    expect(getResourceLinks(BTC_BLOCK, 'https://example.org/block').linkUrl).toBe('https://example.org/block');
    expect(getResourceLinks({ ...eventFixture, refs: ['https://example.org/other'] }).linkUrl).toBe(eventFixture.uri);
  });

  it('prefers the address Pinakes gives for a Pubky app’s object to a web link people wrote', () => {
    expect(
      getResourceLinks({
        uri: 'pubky://someone/pub/x',
        site: 'loopky',
        open_in: [{ client: 'Loopky', url: 'https://loopky.app/x' }],
        refs: ['pubky://someone/pub/x', 'https://homeserver.example/pub/x'],
      }).linkUrl,
    ).toBe('https://loopky.app/x');
  });

  it('never links a ref that is not a web link', () => {
    expect(
      getResourceLinks({ uri: 'btc:block/0', site: null, open_in: [], refs: ['btc:block/0', 'javascript:alert(1)'] })
        .linkUrl,
    ).toBeNull();
  });
});

describe('formatResourcePoint', () => {
  it('shows latitude and longitude to four decimals', () => {
    expect(formatResourcePoint({ lat: 52.5173885, lon: 13.3951309 })).toBe('52.5174, 13.3951');
  });
});

describe('getResourceTagsLabel', () => {
  it.each([
    ['VideoObject', ['Thing', 'CreativeWork', 'MediaObject', 'VideoObject'], 'Tags on this video'],
    ['City', ['Thing', 'Place', 'City'], 'Tags on this city'],
    ['FAQPage', ['Thing', 'CreativeWork', 'WebPage', 'FAQPage'], 'Tags on this FAQ page'],
    ['TheaterGroup', ['Thing', 'Organization', 'PerformingGroup', 'TheaterGroup'], 'Tags on this theater group'],
  ])('names a %s by its type in words', (type, type_path, label) => {
    expect(getResourceTagsLabel({ type, type_path })).toBe(label);
  });

  it('reads the plain word from the deepest type_path entry when the card has no type', () => {
    expect(getResourceTagsLabel({ type: '', type_path: ['Thing', 'CreativeWork', 'MusicRecording'] })).toBe(
      'Tags on this song',
    );
  });

  it.each([
    ['MusicRecording', 'Song', 'Tags on this song'],
    ['MusicAlbum', 'Album', 'Tags on this album'],
    ['MusicGroup', 'Artist', 'Tags on this artist'],
    ['Movie', 'Movie', 'Tags on this movie'],
    ['TVSeries', 'TV series', 'Tags on this TV series'],
  ])('names a %s with the same word as its badge', (type, badge, label) => {
    const card = { type, type_path: [] };
    expect(getResourceTypeLabel(card)).toBe(badge);
    expect(getResourceTagsLabel(card)).toBe(label);
  });

  it('names every type in the Pinakes type facets with the same words as its badge', () => {
    for (const facet of TYPE_FACETS) {
      const badge = getResourceTypeLabel(facet) ?? '';
      // Mid-sentence the first word reads in lower case, unless it is an acronym (`FAQ page`).
      const noun = /^[A-Z0-9]{2,}\b/.test(badge) ? badge : badge.charAt(0).toLowerCase() + badge.slice(1);
      expect(getResourceTagsLabel(facet), facet.type).toBe(`Tags on this ${noun}`);
    }
  });

  it('falls back to the external resource without a typed card', () => {
    expect(getResourceTagsLabel(null)).toBe('Tags on the external resource');
    expect(getResourceTagsLabel({ type: '', type_path: [] })).toBe('Tags on the external resource');
  });
});

describe('hasWideImage', () => {
  it.each([
    ['VideoObject', ['Thing', 'CreativeWork', 'MediaObject', 'VideoObject']],
    ['Movie', ['Thing', 'CreativeWork', 'Movie']],
    ['TVSeries', ['Thing', 'CreativeWork', 'Intangible', 'Series', 'CreativeWorkSeries', 'TVSeries']],
  ])('shows a %s image as a 16:9 frame', (type, type_path) => {
    expect(hasWideImage({ type, type_path })).toBe(true);
  });

  it('reads a wide type from the type_path of a narrower type it has never seen', () => {
    expect(
      hasWideImage({ type: 'LectureRecording', type_path: ['Thing', 'CreativeWork', 'MediaObject', 'VideoObject'] }),
    ).toBe(true);
  });

  it.each([
    ['MusicRecording', ['Thing', 'CreativeWork', 'MusicRecording']],
    ['MusicAlbum', ['Thing', 'CreativeWork', 'MusicPlaylist', 'MusicAlbum']],
    ['Book', ['Thing', 'CreativeWork', 'Book']],
    ['City', ['Thing', 'Place', 'AdministrativeArea', 'City']],
    ['Article', ['Thing', 'CreativeWork', 'Article']],
  ])('keeps a %s image square', (type, type_path) => {
    expect(hasWideImage({ type, type_path })).toBe(false);
  });
});

describe('isCardSurfaceClick', () => {
  const build = () => {
    const card = document.createElement('article');
    card.innerHTML =
      '<p id="text">text</p><a id="link" href="https://example.com"><span id="in-link">x</span></a>' +
      '<button id="button">b</button><div data-resource-controls><span id="in-controls">c</span></div>';
    document.body.append(card);
    return card;
  };

  it('counts a click on the card’s own content', () => {
    const card = build();
    expect(isCardSurfaceClick(card, card.querySelector('#text'))).toBe(true);
    expect(isCardSurfaceClick(card, card)).toBe(true);
  });

  it('leaves out links, buttons and the action rows', () => {
    const card = build();
    for (const id of ['#link', '#in-link', '#button', '#in-controls']) {
      expect(isCardSurfaceClick(card, card.querySelector(id))).toBe(false);
    }
  });

  it('leaves out an element outside the card, such as a menu in a portal', () => {
    const card = build();
    const portal = document.createElement('div');
    document.body.append(portal);
    expect(isCardSurfaceClick(card, portal)).toBe(false);
    expect(isCardSurfaceClick(card, null)).toBe(false);
  });
});

describe('getAlsoOnName', () => {
  it('names an entry by its service, else its host, else the link as written', () => {
    expect(getAlsoOnName(videoFixture.also_on[0])).toBe('TIDAL');
    expect(getAlsoOnName({ uri: 'https://www.example.com/a', site: null })).toBe('example.com');
    expect(getAlsoOnName({ uri: 'isbn:9780140328721', site: '  ' })).toBe('9780140328721');
  });
});

describe('getPubkyObjectApp', () => {
  it('names a Pubky object by its app, never by its path; nothing for any other URI', () => {
    expect(
      getPubkyObjectApp(
        'pubky://1kzgu8sshfqyaqqbm8hkxww18juw6mms8rszs1e8hrg8sy4uasio/pub/loopky/decks/a/manifest.json',
      ),
    ).toBe('loopky');
    expect(getPubkyObjectApp('pubky://1kzgu8sshfqyaqqbm8hkxww18juw6mms8rszs1e8hrg8sy4uasio/pub/')).toBeNull();
    expect(getPubkyObjectApp('isbn:9780140328721')).toBeNull();
    expect(getPubkyObjectApp('https://example.com/pub/x/y')).toBeNull();
  });
});

describe('getAlsoOnIdentifier', () => {
  it('gives the identifier of a non-web entry, unless it is the name already', () => {
    expect(getAlsoOnIdentifier(natureArticleFixture.also_on[0])).toBe('10.1038/nature12373');
    expect(getAlsoOnIdentifier({ uri: 'isbn:9780140328721' })).toBeNull();
    expect(getAlsoOnIdentifier(videoFixture.also_on[0])).toBeNull();
  });
});

describe('getAlsoOnNote', () => {
  it('says nothing for a tagged link', () => {
    expect(getAlsoOnNote(videoFixture.also_on[0])).toBeNull();
  });

  it('marks a derived link with the source it was found through', () => {
    expect(getAlsoOnNote(videoFixture.also_on[7])).toBe('Found via musicbrainz');
    expect(getAlsoOnNote({ uri: 'https://example.com/a', derived: true })).toBe('Found automatically');
  });

  it('dates an archived copy by its capture, in UTC', () => {
    const [archived] = unreachableFixture.also_on;
    expect(plain(getAlsoOnNote(archived, 'en-US'))).toBe('Archived Dec 28, 2018 · found via wayback');
    expect(getAlsoOnNote({ ...archived, at: '2018-12-28T23:59:59-05:00' }, 'en-US')).toMatch(/^Archived Dec 29, 2018/);
    expect(getAlsoOnNote({ ...archived, at: null }, 'en-US')).toBe('Archived · found via wayback');
  });

  it('shows another qualifier as written', () => {
    const submitted = scholarlyArticleFixture.also_on.find((entry) => entry.kind === 'submitted');
    expect(submitted && getAlsoOnNote(submitted)).toMatch(/^Submitted · found via /);
    expect(getAlsoOnNote({ uri: 'https://example.com/a', kind: 'work', derived: true, via: 'x' })).toBe(
      'Work · found via x',
    );
  });

  it('says how a match by metadata was found with its source, never as a qualifier shown on its own', () => {
    const maybe = { uri: 'https://music.apple.com/song/1', derived: true, via: 'itunes_song', kind: ' Maybe ' };
    expect(getAlsoOnNote(maybe)).toBe('Matched by title and length · found via itunes_song');
    expect(getAlsoOnNote({ ...maybe, via: null })).toBe('Matched by title and length · found automatically');
    expect(getAlsoOnNote(maybe, undefined, { withSource: false })).toBeNull();
  });

  it('writes the pdf qualifier as an acronym', () => {
    const pdf = { uri: 'https://www.govinfo.gov/a.pdf', derived: true, via: 'federalregister', kind: 'pdf' };
    expect(getAlsoOnNote(pdf)).toBe('PDF · found via federalregister');
  });

  it('gives the identifier of a non-web entry named by its service', () => {
    const [doi] = natureArticleFixture.also_on;
    expect(doi).toEqual({ id: expect.any(String), uri: 'doi:10.1038/nature12373', site: 'DOI' });
    expect(getAlsoOnNote(doi)).toBe('10.1038/nature12373');
    expect(getAlsoOnNote({ uri: 'osm:node/240109189', site: 'OSM', derived: true, via: 'wikidata' })).toBe(
      'node/240109189 · Found via wikidata',
    );
  });

  it('does not repeat an identifier that already names the entry', () => {
    expect(getAlsoOnNote({ uri: 'isbn:9780140328721' })).toBeNull();
    expect(getAlsoOnNote({ uri: 'isbn:9780140328721', site: ' ', derived: true, via: 'x' })).toBe('Found via x');
  });

  it('leaves out the source a link was found through when asked, keeping its other qualifiers', () => {
    const archived = {
      uri: 'https://web.archive.org/web/2018/x',
      kind: 'archived',
      derived: true,
      via: 'wayback',
      at: null,
    };
    expect(getAlsoOnNote(videoFixture.also_on[7], undefined, { withSource: false })).toBeNull();
    expect(getAlsoOnNote(archived, 'en-US', { withSource: false })).toBe('Archived');
    expect(
      getAlsoOnNote({ uri: 'doi:10.1038/x', site: 'DOI', derived: true, via: 'w' }, undefined, { withSource: false }),
    ).toBe('10.1038/x');
  });
});

describe('getResourceListNote', () => {
  const [nature, , book, , place]: TPinakesCard[] = relatedFixture.items;

  it('names the type and the site', () => {
    expect(getResourceListNote(nature)).toBe('Scholarly article · Nature');
    expect(getResourceListNote(missingFixture)).toBe('Web page · Apple Music');
  });

  it('names the host of its web link when the card has no site', () => {
    expect(getResourceListNote({ ...nature, site: null })).toBe('Scholarly article · nature.com');
  });

  it('names the type alone without a site or web link, and is null without either', () => {
    expect(book.uri).toBe('isbn:9781119473862');
    expect(getResourceListNote(book)).toBe('Book');
    expect(getResourceListNote(place)).toBe('Place');
    expect(getResourceListNote({ uri: 'geo:0,0', type: null, type_path: [], site: null })).toBeNull();
  });
});

describe('getResourceTarget', () => {
  const TIDAL = 'https://tidal.com/track/3524506';
  const SHARE = `${TIDAL}/u`;

  it('acts on the link as written, the card’s own link read along first, each spelling once', () => {
    expect(getResourceTarget({ uri: TIDAL, refs: [SHARE], aliases: [SHARE] }, SHARE)).toEqual({
      uri: SHARE,
      spellings: [TIDAL],
    });
    expect(
      getResourceTarget(
        { uri: TIDAL, refs: [TIDAL, `${TIDAL}/`], aliases: [SHARE] },
        'https://www.tidal.com/track/3524506',
      ),
    ).toEqual({ uri: 'https://www.tidal.com/track/3524506', spellings: [TIDAL, `${TIDAL}/`, SHARE] });
    expect(getResourceTarget({ uri: TIDAL, refs: [SHARE] }, TIDAL)).toEqual({ uri: TIDAL, spellings: [SHARE] });
  });

  it('never acts on the card’s own web link in place of the link as written', () => {
    // Pinakes may have the card's link from a fetch (`rel=canonical`, a redirect).
    const short = 'https://short.example/x';
    const card = { uri: 'https://example.com/canonical', refs: [short] };
    expect(getResourceTarget(card, short)).toEqual({ uri: short, spellings: ['https://example.com/canonical'] });
  });

  it('folds the link as written the way every writer stores it, its own spelling read along', () => {
    const card = { uri: 'https://Example.COM/a', refs: [] };
    expect(getResourceTarget(card, 'HTTPS://Example.com:443/a#top')).toEqual({
      uri: 'https://example.com/a',
      spellings: ['https://Example.COM/a', 'HTTPS://Example.com:443/a#top'],
    });
    expect(getResourceTarget(null, ' https://Example.com/a#top ')).toEqual({
      uri: 'https://example.com/a',
      spellings: [' https://Example.com/a#top '],
    });
  });

  it('writes a link with credentials without them, and never reads one along', () => {
    const link = 'https://user:pw@example.com/b';
    expect(getResourceTarget(null, link)).toEqual({ uri: 'https://example.com/b', spellings: [] });
    expect(getResourceTarget({ uri: TIDAL, refs: [`https://u@${TIDAL.slice(8)}`] }, link)).toEqual({
      uri: 'https://example.com/b',
      spellings: [TIDAL],
    });
  });

  it('acts on the same link whether a Pinakes answered or not, and whichever did', () => {
    const links = [SHARE, 'https://Example.com:443/a?utm_source=x#top', 'https://user:pw@example.com/b'];
    const cards = [
      { uri: TIDAL, refs: [SHARE] },
      { uri: 'https://example.com/a', refs: [], open_in: [{ client: 'web', url: 'https://example.com/page' }] },
      { uri: 'isbn:9780140328721', refs: ['https://openlibrary.org/isbn/9780140328721'] },
      { uri: 'pubky://someone/pub/app.example/decks/1', refs: [] },
    ];
    for (const link of links) {
      const { uri } = getResourceTarget(null, link);
      for (const card of cards) expect(getResourceTarget(card, link).uri).toBe(uri);
    }
    // The tracking parameters Pinakes lists are dropped; the rest of the query stays.
    expect(getResourceTarget(null, links[1]).uri).toBe('https://example.com/a');
    // Credentials are never written.
    expect(getResourceTarget(null, links[2]).uri).toBe('https://example.com/b');
  });

  describe('with no web link as written (a search row of an identifier, its own page)', () => {
    const BLOCK = 'btc:block/000000000000000000012345';
    const MEMPOOL = 'https://mempool.space/block/000000000000000000012345';
    const ISBN = 'isbn:9780140328721';
    const BOOK = 'https://openlibrary.org/isbn/9780140328721';
    // An identifier the app could write that has no page (`getIdentifierPage`).
    const URN = 'urn:x-test:1';

    it('acts on the link as written when it is a web link, the card’s identifier read along first', () => {
      expect(getResourceTarget({ uri: BLOCK, refs: ['https://blockstream.info/block/1', MEMPOOL] }, MEMPOOL)).toEqual({
        uri: MEMPOOL,
        spellings: [BLOCK, 'https://blockstream.info/block/1'],
      });
      // An identifier the app could write (`isbn:`) gives way to the web link too; its old tags are read along.
      expect(getResourceTarget({ uri: ISBN, refs: [] }, BOOK)).toEqual({ uri: BOOK, spellings: [ISBN] });
    });

    it('acts on the card’s own web link, else the first web link people wrote, else the page Pinakes gives', () => {
      expect(getResourceTarget({ uri: BOOK, refs: [MEMPOOL] }, ISBN)).toEqual({
        uri: BOOK,
        spellings: [ISBN, MEMPOOL],
      });
      const open_in = [{ client: 'wikidata', url: 'https://www.wikidata.org/wiki/Q42' }];
      // The page was the target before anyone wrote a web link: it is read along, after the card's own link.
      expect(getResourceTarget({ uri: ISBN, refs: ['doi:10.1/x', BOOK], open_in }, ISBN)).toEqual({
        uri: BOOK,
        spellings: [ISBN, 'https://www.wikidata.org/wiki/Q42', 'doi:10.1/x'],
      });
      // A catalogue card nobody wrote a link for yet: its page.
      expect(getResourceTarget({ uri: 'wikidata:Q42', refs: [], open_in }, 'wikidata:Q42')).toEqual({
        uri: 'https://www.wikidata.org/wiki/Q42',
        spellings: ['wikidata:Q42'],
      });
    });

    it('writes a web link of the card folded: no credentials, no spaces, no tracking', () => {
      const refs = ['https://user:pw@Example.com/a?utm_source=x', ' https://example.com/b'];
      expect(getResourceTarget({ uri: URN, refs }, URN).uri).toBe('https://example.com/a');
      expect(getResourceTarget({ uri: URN, refs: refs.slice(1) }, URN).uri).toBe('https://example.com/b');
      expect(getResourceTarget({ uri: URN, refs: ['https://exam ple.com/c'] }, URN).uri).toBe(URN);
    });

    it('writes any link the fold takes as folded, card or not, even one a browser would not open', () => {
      const odd = 'https://Example.com:8x/a#top';
      expect(getResourceTarget(null, odd).uri).toBe('https://example.com:8x/a');
      expect(getResourceTarget({ uri: ISBN, refs: [BOOK] }, odd).uri).toBe('https://example.com:8x/a');
      // A web link of the card, picked when the user had none, is one a browser opens.
      expect(getResourceTarget({ uri: ISBN, refs: [odd, BOOK] }, ISBN).uri).toBe(BOOK);
      // With none, still folded.
      expect(getResourceTarget({ uri: odd, refs: [] }, ISBN).uri).toBe('https://example.com:8x/a');
    });

    it('acts on the card’s link when nothing of it is on the web, else on the link as written', () => {
      expect(getResourceTarget({ uri: URN, refs: [], open_in: [] }, URN)).toEqual({ uri: URN, spellings: [] });
      expect(getResourceTarget({ uri: URN, refs: ['doi:10.1/x'] }, 'doi:10.1/x')).toEqual({
        uri: URN,
        spellings: ['doi:10.1/x'],
      });
      // `btc:` is no link the app writes: the link as written when it is one.
      expect(getResourceTarget({ uri: BLOCK, refs: [] }, ISBN).uri).toBe(ISBN);
    });

    it('acts on the identifier’s page Pinakes publishes, whichever Pinakes answered', () => {
      const open_in = [{ client: 'web', url: 'https://openlibrary.org/books/OL7353617M' }];
      expect(getResourceTarget({ uri: ISBN, refs: ['https://example.com/a'], open_in }, ISBN)).toEqual({
        uri: BOOK,
        spellings: [ISBN, 'https://openlibrary.org/books/OL7353617M', 'https://example.com/a'],
      });
      expect(getResourceTarget({ uri: ISBN, refs: [] }, ISBN).uri).toBe(BOOK);
      const tx = 'a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d';
      expect(
        getResourceTarget({ uri: `btc:tx/${tx}`, refs: [`https://blockstream.info/tx/${tx}`] }, `btc:tx/${tx}`).uri,
      ).toBe(`https://mempool.space/tx/${tx}`);
      expect(
        getResourceTarget(
          { uri: 'wikidata:Q42', refs: ['https://en.wikipedia.org/wiki/Douglas_Adams'] },
          'wikidata:Q42',
        ).uri,
      ).toBe('https://www.wikidata.org/wiki/Q42');
    });

    it('keeps the card’s web links for an identifier with no page (mbid:, imdb:, barcodes, podcast keys)', () => {
      const mbid = 'mbid:b1a9c0e9-d987-4042-ae91-78d6a3267d69';
      const recording = 'https://musicbrainz.org/recording/b1a9c0e9-d987-4042-ae91-78d6a3267d69';
      expect(getResourceTarget({ uri: mbid, refs: [recording] }, mbid).uri).toBe(recording);
      const open_in = [{ client: 'web', url: 'https://www.imdb.com/title/tt0111161/' }];
      expect(getResourceTarget({ uri: 'imdb:tt0111161', refs: [], open_in }, 'imdb:tt0111161').uri).toBe(
        'https://www.imdb.com/title/tt0111161/',
      );
    });

    it('keeps a Pubky object on its own address, unless the link as written is a web link', () => {
      const open_in = [{ client: 'app', url: 'https://app.example/deck/1' }];
      const deck = { uri: 'pubky://someone/pub/app.example/decks/1', refs: [SHARE], open_in };
      expect(getResourceTarget(deck, deck.uri)).toEqual({ uri: deck.uri, spellings: [SHARE] });
      expect(getResourceTarget(deck, SHARE)).toEqual({ uri: SHARE, spellings: [deck.uri] });
    });

    it('reads the card’s link first within MAX_LINK_SPELLINGS', () => {
      const refs = Array.from({ length: MAX_LINK_SPELLINGS + 5 }, (_, index) => `${MEMPOOL}?s=${index}`);
      const { spellings } = getResourceTarget({ uri: BLOCK, refs }, MEMPOOL);
      expect(spellings).toHaveLength(MAX_LINK_SPELLINGS);
      expect(spellings[0]).toBe(BLOCK);
    });
  });

  it('acts on the link as written without a card', () => {
    expect(getResourceTarget(null, SHARE)).toEqual({ uri: SHARE, spellings: [] });
    expect(getResourceTarget(undefined, SHARE)).toEqual({ uri: SHARE, spellings: [] });
    // An identifier as written acts on its page, as with a card.
    expect(getResourceTarget(null, 'isbn:9780140328721')).toEqual({
      uri: 'https://openlibrary.org/isbn/9780140328721',
      spellings: ['isbn:9780140328721'],
    });
    expect(getResourceTarget(null, 'urn:x-test:1')).toEqual({ uri: 'urn:x-test:1', spellings: [] });
  });

  it('writes a link without its tracking parameters, the link as written read along', () => {
    const tracked = `${TIDAL}?utm_source=share&u=1`;
    expect(getResourceTarget({ uri: TIDAL, refs: [] }, tracked)).toEqual({
      uri: `${TIDAL}?u=1`,
      spellings: [TIDAL, tracked],
    });
    const spotify = 'https://open.spotify.com/track/6LgJvl0Xdtc73RJ1mmpotq';
    expect(getResourceTarget(null, `${spotify}?si=4f1e2d3c`)).toEqual({
      uri: spotify,
      spellings: [`${spotify}?si=4f1e2d3c`],
    });
  });

  it('reads at most MAX_LINK_SPELLINGS other spellings', () => {
    const refs = Array.from({ length: MAX_LINK_SPELLINGS + 5 }, (_, index) => `${TIDAL}?s=${index}`);
    expect(getResourceTarget({ uri: TIDAL, refs }, TIDAL).spellings).toHaveLength(MAX_LINK_SPELLINGS);
  });
});

describe('playsInCard', () => {
  const audio = { url: 'https://cdn.example.com/episode.mp3', type: 'audio/mpeg', preview: false };

  it('is an episode’s whole audio or a show’s latest episodes, never a preview', () => {
    expect(playsInCard({ stream: audio })).toBe(true);
    expect(playsInCard({ episodes: [{ uri: 'https://example.com/e/1', guid: '1', stream: audio }] })).toBe(true);
    expect(playsInCard({ stream: { ...audio, preview: true } })).toBe(false);
    expect(playsInCard({ stream: { ...audio, type: 'video/mp4' } })).toBe(false);
    expect(playsInCard({ episodes: [{ uri: 'https://example.com/e/1', guid: '1', stream: null }] })).toBe(false);
    expect(playsInCard({})).toBe(false);
  });
});

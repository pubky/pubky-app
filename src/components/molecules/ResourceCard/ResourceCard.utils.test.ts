import { describe, expect, it } from 'vitest';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import typeFacetFixture from '@/services/pinakes/fixtures/search.type-facet.json';
import { PinakesStatus, type TPinakesTypeFacet } from '@/services/pinakes/pinakes.types';
import { ResourceFamily } from './ResourceCard.types';
import {
  formatResourceDates,
  formatResourcePoint,
  getDisplayLink,
  getEventStatusNote,
  getFaviconUrl,
  getHttpUrl,
  getLinkHost,
  getResourceFamily,
  getResourceLinks,
  getResourceStatus,
  getResourceTagsLabel,
  getResourceTypeLabel,
  hasWideImage,
  isCardSurfaceClick,
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
  it.each(['https://example.com/a', 'http://www.dancarlin.com/graphics/DC_HH_iTunes.jpg'])('keeps %s', (url) => {
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
    'not a url',
    '',
    null,
    undefined,
  ])('refuses %s', (value) => {
    expect(getHttpUrl(value)).toBeNull();
  });
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

  it('asks a web link’s own origin for its favicon, and nothing else', () => {
    expect(getFaviconUrl('https://en.wikipedia.org/wiki/Bitcoin')).toBe('https://en.wikipedia.org/favicon.ico');
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

  it('falls back to the viewer’s zone for a time zone it does not know', () => {
    expect(formatResourceDates({ ...eventFixture, end: null, tz: 'Not/AZone' }, 'en-US')).toMatch(/2026/);
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

  it('shows any other status as written', () => {
    expect(getEventStatusNote('cancelled')).toBe('Event status: cancelled');
    expect(getEventStatusNote('EventPostponed')).toBe('Event status: EventPostponed');
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
    expect(getResourceLinks({ uri: 'isbn:9780140328721', site: null, open_in: [] })).toEqual({
      linkUrl: null,
      sourceUri: 'isbn:9780140328721',
      siteName: null,
    });
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
    expect(hasWideImage({ type: 'MusicVideoObject', type_path: ['Thing', 'MediaObject', 'VideoObject'] })).toBe(true);
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

import { describe, expect, it } from 'vitest';
import articleFixture from '@/services/pinakes/fixtures/by-uri.article.json';
import placeFixture from '@/services/pinakes/fixtures/by-uri.place.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesAlsoOn } from '@/services/pinakes/pinakes.types';
import {
  dedupeAlsoOn,
  getLanguageName,
  getLanguageTag,
  groupAlsoOn,
  pickAlsoOn,
  pickAlsoOnLanguage,
} from './ResourceAlsoOn.utils';

const wiki = (lang: string, site = `Wikipedia (${lang})`): TPinakesAlsoOn => ({
  uri: `https://${lang}.wikipedia.org/wiki/Berlin`,
  site,
  derived: true,
  via: 'wikidata',
});

describe('groupAlsoOn', () => {
  it('makes the Wikipedia editions of a place one row, where the first of them stood', () => {
    const rows = groupAlsoOn(placeFixture.also_on);

    expect(placeFixture.also_on).toHaveLength(32);
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => (row.kind === 'entry' ? row.entry.site : `${row.name} ×${row.editions.length}`))).toEqual([
      'Apple Maps',
      'Google Maps',
      'Official website',
      'Tripadvisor',
      'Wikidata',
      'Wikipedia ×27',
    ]);
    const group = rows[5];
    expect(group.kind === 'languages' && group.editions.slice(0, 3).map((edition) => edition.lang)).toEqual([
      'ar',
      'ca',
      'cs',
    ]);
  });

  it('groups any service listed in several languages on one site, not only Wikipedia', () => {
    const rows = groupAlsoOn([
      { uri: 'https://de.wikivoyage.org/wiki/Berlin', site: 'Wikivoyage (de)' },
      { uri: 'https://example.com/a', site: 'Example' },
      { uri: 'https://en.wikivoyage.org/wiki/Berlin', site: 'Wikivoyage (en)' },
      { uri: 'https://pt-br.wikiquote.org/wiki/X', site: 'Wikiquote (pt-br)' },
      { uri: 'https://fr.wikiquote.org/wiki/X', site: 'Wikiquote (fr)' },
    ]);

    expect(rows.map((row) => (row.kind === 'entry' ? row.entry.site : row.name))).toEqual([
      'Wikivoyage',
      'Example',
      'Wikiquote',
    ]);
  });

  it('leaves a service in one language as an ordinary row', () => {
    const rows = groupAlsoOn([wiki('de'), { uri: 'https://www.wikidata.org/wiki/Q64', site: 'Wikidata' }]);

    expect(rows).toEqual([
      { kind: 'entry', entry: wiki('de') },
      { kind: 'entry', entry: { uri: 'https://www.wikidata.org/wiki/Q64', site: 'Wikidata' } },
    ]);
  });

  it('leaves lists without language editions as they are, one row per entry', () => {
    expect(groupAlsoOn(videoFixture.also_on)).toEqual(videoFixture.also_on.map((entry) => ({ kind: 'entry', entry })));
    expect(groupAlsoOn([])).toEqual([]);
  });

  it('keeps a name that only looks alike on another site, and non-web links, as their own rows', () => {
    const rows = groupAlsoOn([
      wiki('de'),
      { uri: 'https://mirror.example/wiki/Berlin', site: 'Wikipedia (fr)' },
      { uri: 'isbn:9780140328721', site: 'Wikipedia (es)' },
      wiki('en'),
    ]);

    expect(rows.map((row) => row.kind)).toEqual(['languages', 'entry', 'entry']);
    expect(rows[0].kind === 'languages' && rows[0].editions.map((edition) => edition.lang)).toEqual(['de', 'en']);
  });

  it('groups only editions whose host starts with their code, not brackets that look like one', () => {
    const rows = groupAlsoOn([
      { uri: 'https://open.spotify.com/album/1', site: 'Spotify (EP)' },
      { uri: 'https://open.spotify.com/album/2', site: 'Spotify (LP)' },
      { uri: 'https://music.apple.com/de/album/1', site: 'Apple Music (de)' },
      { uri: 'https://music.apple.com/us/album/1', site: 'Apple Music (us)' },
    ]);

    expect(rows.map((row) => row.kind)).toEqual(['entry', 'entry', 'entry', 'entry']);
  });

  it('reads Wikimedia’s own codes: hyphenated ones and Simple English', () => {
    const rows = groupAlsoOn([wiki('zh-min-nan'), wiki('simple'), wiki('be-x-old'), wiki('en')]);

    expect(rows).toHaveLength(1);
    expect(rows[0].kind === 'languages' && rows[0].editions.map((edition) => edition.lang)).toEqual([
      'zh-min-nan',
      'simple',
      'be-x-old',
      'en',
    ]);
  });

  it('keeps a second link for a language the row already has as its own row, so nothing is dropped', () => {
    const second = { ...wiki('de'), uri: 'https://de.wikipedia.org/wiki/Berlin_(Begriffskl%C3%A4rung)' };
    const rows = groupAlsoOn([wiki('de'), wiki('fr'), second]);

    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ kind: 'entry', entry: second });
  });

  it('counts the rows the list shows: an article’s 30 other Wikipedias are one', () => {
    expect(groupAlsoOn(articleFixture.also_on)).toHaveLength(3);
  });
});

describe('pickAlsoOnLanguage', () => {
  const langs = ['ar', 'de', 'en', 'pt-br', 'zh'];

  it('takes the viewer’s first preferred language the row has', () => {
    expect(pickAlsoOnLanguage(langs, ['fi', 'de', 'en'])).toBe('de');
  });

  it('matches a regional preference to its language', () => {
    expect(pickAlsoOnLanguage(langs, ['de-CH'])).toBe('de');
    expect(pickAlsoOnLanguage(langs, ['ZH-hans'])).toBe('zh');
    expect(pickAlsoOnLanguage(['en', 'no'], ['nb-NO'])).toBe('no');
  });

  it('never takes a hyphenated edition, a language of its own, for a region', () => {
    expect(pickAlsoOnLanguage(['en', 'zh-yue'], ['zh-TW'])).toBe('en');
    expect(pickAlsoOnLanguage(['en', 'zh-yue'], ['yue-HK'])).toBe('zh-yue');
    expect(pickAlsoOnLanguage(['pt-br', 'en'], ['pt'])).toBe('en');
  });

  it('does not take Simple English for English', () => {
    expect(pickAlsoOnLanguage(['ar', 'simple'], ['en-US', 'en'])).toBe('ar');
  });

  it('falls back to English, then to the first edition', () => {
    expect(pickAlsoOnLanguage(langs, ['fi'])).toBe('en');
    expect(pickAlsoOnLanguage(langs, [])).toBe('en');
    expect(pickAlsoOnLanguage(['ar', 'de'], ['fi'])).toBe('ar');
  });
});

describe('getLanguageName', () => {
  it('names a language in its own language, with its code', () => {
    expect(getLanguageName('de')).toBe('Deutsch (de)');
    expect(getLanguageName('fr')).toBe('Français (fr)');
    expect(getLanguageName('en')).toBe('English (en)');
  });

  it('names Wikimedia’s own codes by the language they stand for', () => {
    expect(getLanguageName('als')).toBe('Schwiizertüütsch (als)');
    expect(getLanguageName('no')).toBe('Norsk bokmål (no)');
    expect(getLanguageName('simple')).toBe('Simple English (simple)');
    expect(getLanguageTag('als')).toBe('gsw');
    expect(getLanguageTag('simple')).toBe('en');
  });

  it('falls back to the code for a tag the runtime cannot name', () => {
    expect(getLanguageName('qqq')).toBe('qqq');
    expect(getLanguageName('not a tag')).toBe('not a tag');
  });
});

describe('dedupeAlsoOn', () => {
  const discogs = (via: string, uri = `https://www.discogs.com/master/${via}`): TPinakesAlsoOn => ({
    uri,
    site: 'Discogs',
    derived: true,
    via,
  });

  it('keeps one entry per service, its first, where the service is first listed', () => {
    const deduped = dedupeAlsoOn(videoFixture.also_on);

    expect(deduped.map((entry) => entry.site)).toEqual([
      'TIDAL',
      'Apple Music',
      'YouTube',
      'MusicBrainz',
      'Deezer',
      'Spotify',
    ]);
    expect(deduped[1]).toBe(videoFixture.also_on[1]);
    expect(deduped[5]).toBe(videoFixture.also_on[6]);
  });

  it('matches names whatever their case, and keeps the first with a web link', () => {
    const viaWikidata = discogs('wikidata', 'discogs:master/96559');
    const viaMusicBrainz = discogs('musicbrainz');

    expect(dedupeAlsoOn([viaWikidata, { ...viaMusicBrainz, site: 'discogs' }, discogs('other')])).toEqual([
      { ...viaMusicBrainz, site: 'discogs' },
    ]);
  });

  it('leaves every language edition, each a name of its own, to the language grouping', () => {
    expect(dedupeAlsoOn(placeFixture.also_on)).toEqual(placeFixture.also_on);
  });
});

describe('dedupeAlsoOn by host', () => {
  it('makes one service of web links on one host under different names', () => {
    const named = { uri: 'https://www.netflix.com/title/20557937', site: 'Netflix' };
    const byHost = { uri: 'https://netflix.com/title/1', site: 'www.netflix.com' };
    expect(dedupeAlsoOn([named, byHost])).toEqual([named]);
  });
});

describe('pickAlsoOn', () => {
  const own = { site: videoFixture.site, uris: [videoFixture.uri] };

  it('leaves out the card’s own service, one entry per other service in Pinakes’ order', () => {
    expect(pickAlsoOn(videoFixture.also_on, own).map((entry) => entry.site)).toEqual([
      'TIDAL',
      'Apple Music',
      'MusicBrainz',
      'Deezer',
      'Spotify',
    ]);
  });

  it('matches the own service by host when its name differs, and by name on another host', () => {
    const alsoOn: TPinakesAlsoOn[] = [
      { uri: 'https://m.youtube.com/watch?v=x', site: 'YT' },
      { uri: 'https://youtube.com/watch?v=y', site: 'Videos' },
      { uri: 'https://youtu.be/z', site: 'youtube' },
      { uri: 'https://tidal.com/track/1', site: 'TIDAL' },
    ];
    expect(pickAlsoOn(alsoOn, own).map((entry) => entry.uri)).toEqual([
      'https://m.youtube.com/watch?v=x',
      'https://tidal.com/track/1',
    ]);
  });

  it('keeps the other language editions of a Wikipedia article', () => {
    const picked = pickAlsoOn(placeFixture.also_on, {
      site: 'Wikipedia (en)',
      uris: ['https://en.wikipedia.org/wiki/Berlin'],
    });
    expect(picked.some((entry) => entry.site === 'Wikipedia (de)')).toBe(true);
    expect(picked.some((entry) => entry.site === 'Wikipedia (en)')).toBe(false);
  });
});

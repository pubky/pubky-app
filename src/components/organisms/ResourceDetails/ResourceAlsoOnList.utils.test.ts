import { describe, expect, it } from 'vitest';
import { getAlsoOnSource, getLinkKey, mergeAlsoOn, SHARED_ON_PUBKY_NOTE } from './ResourceAlsoOnList.utils';

const NETFLIX = { id: 'n', uri: 'https://www.netflix.com/title/20557937', site: 'www.netflix.com' };
const TMDB = { id: 't', uri: 'https://www.themoviedb.org/movie/603', site: 'The Movie Database' };
const IMDB = { uri: 'https://www.imdb.com/title/tt0133093/', site: 'IMDb', derived: true, via: 'wikidata' };
const CARD = {
  uri: 'https://letterboxd.com/film/the-matrix/',
  site: 'Letterboxd',
  open_in: [],
  refs: ['https://letterboxd.com/film/the-matrix/'],
  aliases: [],
  also_on: [NETFLIX, TMDB, IMDB],
};
const member = (id: string, uri: string, site: string | null = null) => ({ id, uri, site });
const MEMBERS = [member('n', NETFLIX.uri, NETFLIX.site), member('self', CARD.uri), member('t', TMDB.uri, TMDB.site)];

const describeRows = (rows: ReturnType<typeof mergeAlsoOn>) =>
  rows.map((row) => (row.kind === 'languages' ? `languages:${row.name}` : `${row.kind}:${row.entry.uri}`));

describe('getLinkKey', () => {
  it('compares web links without www., the host’s case, the scheme, a trailing slash or a fragment', () => {
    const key = getLinkKey('https://example.com/a');
    expect(getLinkKey('https://WWW.Example.com/a/')).toBe(key);
    expect(getLinkKey('http://example.com/a')).toBe(key);
    expect(getLinkKey('https://example.com/a#top')).toBe(key);
    expect(getLinkKey('https://example.com/')).toBe(getLinkKey('https://example.com'));
  });

  it('keeps the query and the path’s case', () => {
    expect(getLinkKey('https://example.com/a?b=1')).not.toBe(getLinkKey('https://example.com/a'));
    expect(getLinkKey('https://example.com/A')).not.toBe(getLinkKey('https://example.com/a'));
  });

  it('keeps any other URI as written, case-folded', () => {
    expect(getLinkKey(' ISBN:9781119473862 ')).toBe('isbn:9781119473862');
  });
});

describe('mergeAlsoOn', () => {
  it('lists Pinakes’ entries in its order, one row each, then the members for services it has no link for', () => {
    const extra = member('x', 'https://open.spotify.com/track/1', 'Spotify');
    expect(describeRows(mergeAlsoOn(CARD, [...MEMBERS, extra]))).toEqual([
      `entry:${NETFLIX.uri}`,
      `entry:${TMDB.uri}`,
      `entry:${IMDB.uri}`,
      `entry:${extra.uri}`,
    ]);
  });

  it('keeps Pinakes’ link of a service over a member on the same service', () => {
    const otherNetflix = member('n2', 'https://www.netflix.com/title/1', 'Netflix');
    const rows = mergeAlsoOn(CARD, [otherNetflix]);
    expect(describeRows(rows).filter((row) => row.includes('netflix'))).toEqual([`entry:${NETFLIX.uri}`]);
  });

  it('reads the same before the group is read', () => {
    expect(describeRows(mergeAlsoOn(CARD, undefined))).toEqual([
      `entry:${NETFLIX.uri}`,
      `entry:${TMDB.uri}`,
      `entry:${IMDB.uri}`,
    ]);
  });

  it('leaves out the card’s own service, its own links, and every other link of a service', () => {
    const card = {
      uri: 'https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq',
      site: 'Spotify',
      open_in: [],
      refs: ['https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq'],
      aliases: [],
      also_on: [
        { uri: 'https://www.deezer.com/track/67238735', site: 'Deezer', id: 'd' },
        { uri: 'https://musicbrainz.org/recording/1', site: 'MusicBrainz', id: 'm' },
        { uri: 'https://music.apple.com/song/1', site: 'Apple Music', derived: true, via: 'musicbrainz' },
        { uri: 'https://music.apple.com/song/2', site: 'Apple Music', derived: true, via: 'musicbrainz' },
        { uri: 'https://www.deezer.com/track/2', site: 'Deezer', derived: true, via: 'musicbrainz' },
        { uri: 'https://open.spotify.com/track/2', site: 'Spotify', derived: true, via: 'musicbrainz' },
      ],
    };
    const spotifyMember = member('s', 'https://open.spotify.com/track/3', 'Spotify');
    expect(describeRows(mergeAlsoOn(card, [spotifyMember]))).toEqual([
      'entry:https://www.deezer.com/track/67238735',
      'entry:https://musicbrainz.org/recording/1',
      'entry:https://music.apple.com/song/1',
    ]);
  });

  it('keeps the services people wrote links for, other than the one the card opens', () => {
    const book = {
      uri: 'isbn:9780140328721',
      site: null,
      open_in: [{ client: 'Open Library', url: 'https://openlibrary.org/books/OL7353617M' }],
      refs: ['https://www.goodreads.com/book/show/1507552', 'https://www.amazon.com/dp/0140328726'],
      aliases: [],
      also_on: [
        { uri: 'https://openlibrary.org/works/OL45804W', site: 'Open Library', derived: true, via: 'wikidata' },
        { uri: 'https://www.goodreads.com/work/editions/44775', site: 'Goodreads', derived: true, via: 'wikidata' },
        { uri: 'https://www.librarything.com/work/6446', site: 'LibraryThing', derived: true, via: 'wikidata' },
      ],
    };
    // The header opens Open Library; Goodreads stays though people wrote a Goodreads link for it.
    expect(describeRows(mergeAlsoOn(book, null))).toEqual([
      'entry:https://www.goodreads.com/work/editions/44775',
      'entry:https://www.librarything.com/work/6446',
    ]);
  });

  it('drops repeated Also on links and the card’s own links', () => {
    const card = {
      ...CARD,
      also_on: [
        IMDB,
        { ...IMDB, uri: 'https://imdb.com/title/tt0133093' },
        { uri: 'https://letterboxd.com/film/the-matrix' },
      ],
    };
    expect(describeRows(mergeAlsoOn(card, null))).toEqual([`entry:${IMDB.uri}`]);
  });

  it('keeps a service in several languages as one row', () => {
    const wiki = (lang: string) => ({ uri: `https://${lang}.wikipedia.org/wiki/Berlin`, site: `Wikipedia (${lang})` });
    const card = { ...CARD, also_on: [wiki('de'), wiki('en'), IMDB] };
    expect(describeRows(mergeAlsoOn(card, undefined))).toEqual(['languages:Wikipedia', `entry:${IMDB.uri}`]);
  });

  it('is empty for a card on no other service', () => {
    expect(mergeAlsoOn({ ...CARD, also_on: [] }, [member('self', CARD.uri)])).toEqual([]);
  });
});

describe('getAlsoOnSource', () => {
  it('says where a link came from: shared on Pubky, or the source Pinakes found it through', () => {
    expect(getAlsoOnSource(NETFLIX)).toBe(SHARED_ON_PUBKY_NOTE);
    expect(getAlsoOnSource(IMDB)).toBe('Found via wikidata');
    expect(getAlsoOnSource({ uri: 'https://example.com', derived: true })).toBe('Found automatically');
    expect(getAlsoOnSource({ uri: 'https://example.com' })).toBeNull();
  });
});

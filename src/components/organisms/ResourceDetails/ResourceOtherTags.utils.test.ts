import { describe, expect, it } from 'vitest';
import { withResourceViewerListed } from '@/pipes/tag/tag.resource';
import type { NexusTag } from '@/services/nexus/nexus.types';
import type { TPinakesAlsoOn } from '@/services/pinakes/pinakes.types';
import { getOtherLinks, getOwnLinkUris, MAX_OTHER_LINKS, mergeOtherLinkTags } from './ResourceOtherTags.utils';

const LETTERBOXD = 'https://letterboxd.com/film/the-matrix/';
const NETFLIX = 'https://www.netflix.com/title/20557937';
const TMDB = 'https://www.themoviedb.org/movie/603';
const IMDB = 'https://www.imdb.com/title/tt0133093/';

const tag = (label: string, taggers: string[], count = taggers.length): NexusTag => ({
  label,
  taggers,
  taggers_count: count,
  relationship: false,
  tag_uri: null,
});

describe('getOwnLinkUris', () => {
  it('is the page link, the acted-on link, the canonical link, its refs and its aliases', () => {
    const own = getOwnLinkUris(
      {
        uri: LETTERBOXD,
        refs: [LETTERBOXD, 'https://boxd.it/29Lu'],
        aliases: ['http://letterboxd.com/film/the-matrix'],
      },
      'https://letterboxd.com/film/the-matrix',
      LETTERBOXD,
    );
    expect([...own].sort()).toEqual(
      [
        LETTERBOXD,
        'https://boxd.it/29Lu',
        'http://letterboxd.com/film/the-matrix',
        'https://letterboxd.com/film/the-matrix',
      ].sort(),
    );
  });
});

describe('getOtherLinks', () => {
  const card = { id: 'letterboxd', also_on: [] as TPinakesAlsoOn[] };
  const own = new Set([LETTERBOXD]);

  it('lists the other group members, their written links first, then Also on, by URI once each', () => {
    const links = getOtherLinks(
      {
        ...card,
        also_on: [
          { uri: NETFLIX, id: 'netflix', site: 'Netflix' },
          { uri: IMDB, site: 'IMDb' },
        ],
      },
      [
        { id: 'netflix', uri: NETFLIX, refs: [NETFLIX], site: 'Netflix' },
        { id: 'letterboxd', uri: LETTERBOXD, refs: [LETTERBOXD], site: 'Letterboxd' },
        { id: 'tmdb', uri: TMDB, refs: ['https://themoviedb.org/movie/603', TMDB], site: 'TMDB' },
      ],
      own,
    );
    expect(links).toEqual([
      { uri: NETFLIX, name: 'Netflix' },
      { uri: 'https://themoviedb.org/movie/603', name: 'TMDB' },
      { uri: TMDB, name: 'TMDB' },
      { uri: IMDB, name: 'IMDb' },
    ]);
  });

  it('never lists one of the page link’s own URIs, even under another member', () => {
    const links = getOtherLinks(
      { id: 'a', also_on: [{ uri: LETTERBOXD, site: 'Letterboxd' }] },
      [{ id: 'b', uri: 'https://example.com/b', refs: [LETTERBOXD], site: null }],
      own,
    );
    expect(links.map((link) => link.uri)).toEqual(['https://example.com/b']);
  });

  it('leaves out derived Also on links, which nobody tagged', () => {
    const links = getOtherLinks(
      {
        ...card,
        also_on: [
          { uri: IMDB, site: 'IMDb', derived: true, via: 'wikidata' },
          { uri: NETFLIX, site: 'Netflix' },
        ],
      },
      null,
      own,
    );
    expect(links).toEqual([{ uri: NETFLIX, name: 'Netflix' }]);
  });

  it('never reads a match by metadata (a derived "maybe" link) as the same thing, and a repeated entry once', () => {
    const links = getOtherLinks(
      {
        ...card,
        also_on: [
          { uri: NETFLIX, id: 'netflix', site: 'Netflix' },
          { uri: TMDB, site: 'TMDB', derived: true, kind: 'maybe', via: 'tmdb' },
          { uri: NETFLIX, id: 'netflix', site: 'Netflix' },
        ],
      },
      null,
      own,
    );
    expect(links).toEqual([{ uri: NETFLIX, name: 'Netflix' }]);
  });

  describe('a cold card: the refs Pinakes gives with each exact Also on member', () => {
    // OK Computer (Pinakes #153, :8094 2026-11-13): Apple Music and Discogs are tagged on spellings other
    // than their canonical links, and only `also_on[].refs` names them; no group was read.
    const APPLE = 'https://music.apple.com/album/1097861387';
    const APPLE_REF = 'https://music.apple.com/us/album/ok-computer/1097861387';
    const DISCOGS = 'https://www.discogs.com/master/21491';
    const DISCOGS_REF = 'https://www.discogs.com/master/21491-Radiohead-OK-Computer';
    const DEEZER = 'https://www.deezer.com/album/14879699';
    const MB = 'https://musicbrainz.org/release-group/b1392450-e666-3926-a536-22c65f834433';
    const okComputer = {
      id: 'e5cb1c655abb4b858e143a38c30ae2ab',
      also_on: [
        { id: '321bb0ee3d61e16e01debddca7b7f456', uri: DEEZER, site: 'Deezer' },
        { id: '97f542123570f8046812993d331df40f', uri: APPLE, site: 'Apple Music', refs: [APPLE_REF] },
        { id: 'c500ea663c6d7733f63ee92676cdd1a6', uri: DISCOGS, site: 'Discogs', refs: [DISCOGS_REF] },
      ] as TPinakesAlsoOn[],
    };

    it('reads each member’s written links first, then its canonical link, with no group', () => {
      expect(getOtherLinks(okComputer, undefined, new Set([MB]))).toEqual([
        { uri: DEEZER, name: 'Deezer' },
        { uri: APPLE_REF, name: 'Apple Music' },
        { uri: APPLE, name: 'Apple Music' },
        { uri: DISCOGS_REF, name: 'Discogs' },
        { uri: DISCOGS, name: 'Discogs' },
      ]);
    });

    it('never reads the refs of a derived link or a match by metadata ("maybe")', () => {
      const links = getOtherLinks(
        {
          ...okComputer,
          also_on: [
            { uri: 'https://tidal.com/album/58990510', site: 'TIDAL', derived: true, refs: ['https://tidal.com/x'] },
            {
              uri: 'https://music.apple.com/us/song/1',
              site: 'Apple Music',
              derived: true,
              kind: 'maybe',
              refs: ['https://music.apple.com/us/song/airbag/1'],
            },
          ] as TPinakesAlsoOn[],
        },
        undefined,
        new Set([MB]),
      );
      expect(links).toEqual([]);
    });

    it('reads a ref once: never one of the card’s own URIs, nor one a member or another entry already gave', () => {
      const links = getOtherLinks(
        {
          ...okComputer,
          also_on: [
            // A ref that is the card's own written link, one repeated, and one that is another entry's canonical link.
            { id: 'apple', uri: APPLE, site: 'Apple Music', refs: [MB, APPLE_REF, APPLE_REF, DEEZER] },
            { id: 'deezer', uri: DEEZER, site: 'Deezer', refs: [DEEZER] },
          ] as TPinakesAlsoOn[],
        },
        [{ id: 'apple', uri: APPLE, refs: [APPLE_REF], site: 'Apple Music' }],
        new Set([MB]),
      );
      expect(links.map((link) => link.uri)).toEqual([APPLE_REF, APPLE, DEEZER]);
    });

    it('reads at most MAX_OTHER_LINKS links, refs included', () => {
      const also_on = Array.from({ length: 10 }, (_, index) => ({
        id: `m${index}`,
        uri: `https://e.com/${index}`,
        refs: Array.from({ length: 5 }, (__, ref) => `https://e.com/${index}/r${ref}`),
      }));
      const links = getOtherLinks({ ...card, also_on }, null, own);
      expect(links).toHaveLength(MAX_OTHER_LINKS);
      // Whole members first: the first ones keep their refs and canonical links.
      expect(links.slice(0, 6).map((link) => link.uri)).toEqual([...also_on[0].refs, also_on[0].uri]);
    });
  });

  it('names a link without a service by its host', () => {
    expect(getOtherLinks({ ...card, also_on: [{ uri: 'https://mubi.com/films/3394' }] }, undefined, own)).toEqual([
      { uri: 'https://mubi.com/films/3394', name: 'mubi.com' },
    ]);
  });

  it('reads at most MAX_OTHER_LINKS links', () => {
    const also_on = Array.from({ length: MAX_OTHER_LINKS + 5 }, (_, index) => ({ uri: `https://e.com/${index}` }));
    expect(getOtherLinks({ ...card, also_on }, null, own)).toHaveLength(MAX_OTHER_LINKS);
  });
});

describe('mergeOtherLinkTags', () => {
  const netflix = { uri: NETFLIX, name: 'Netflix' };
  const tmdb = { uri: TMDB, name: 'TMDB' };

  it('merges one label across links, counting a person who tagged both links once', () => {
    const merged = mergeOtherLinkTags([
      { link: netflix, tags: [tag('film', ['ann']), tag('netflix', ['ann'])] },
      { link: tmdb, tags: [tag('film', ['ann', 'bob', 'cy']), tag('scifi', ['bob', 'cy'])] },
    ]);
    expect(merged.map(({ label, count }) => [label, count])).toEqual([
      ['film', 3],
      ['scifi', 2],
      ['netflix', 1],
    ]);
    expect(merged[0].taggers.sort()).toEqual(['ann', 'bob', 'cy']);
    expect(merged[0].isComplete).toBe(true);
    // Each link keeps who Nexus listed there, so a detail can say who put the tag where.
    expect(merged[0].sources).toEqual([
      { uri: TMDB, name: 'TMDB', count: 3, taggers: ['ann', 'bob', 'cy'] },
      { uri: NETFLIX, name: 'Netflix', count: 1, taggers: ['ann'] },
    ]);
  });

  it('joins labels as Nexus stores them, case-folded', () => {
    const merged = mergeOtherLinkTags([
      { link: netflix, tags: [tag('Film', ['ann'])] },
      { link: tmdb, tags: [tag('film', ['bob'])] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ label: 'film', count: 2 });
  });

  it('counts at least the most taggers one link has when Nexus lists fewer than it counts', () => {
    const merged = mergeOtherLinkTags([
      { link: netflix, tags: [tag('film', ['ann'], 1)] },
      { link: tmdb, tags: [tag('film', ['ann', 'bob'], 9)] },
    ]);
    expect(merged[0].count).toBe(9);
    expect(merged[0].isComplete).toBe(false);
    expect(merged[0].sources.map((source) => source.count)).toEqual([9, 1]);
  });

  it('lists a link once per chip when it holds two spellings of the label, with the larger count', () => {
    const merged = mergeOtherLinkTags([{ link: netflix, tags: [tag('Film', ['ann']), tag('film', ['ann', 'bob'])] }]);
    expect(merged).toEqual([
      {
        label: 'film',
        taggers: ['ann', 'bob'],
        count: 2,
        isComplete: true,
        relationship: false,
        sources: [{ ...netflix, count: 2, taggers: ['ann', 'bob'] }],
      },
    ]);
  });

  it('joins the taggers of two spellings on one link, counting each once', () => {
    const merged = mergeOtherLinkTags([{ link: netflix, tags: [tag('Film', ['ann', 'cy']), tag('film', ['bob'])] }]);
    expect(merged[0].sources).toEqual([{ ...netflix, count: 3, taggers: ['ann', 'cy', 'bob'] }]);
    expect(merged[0].count).toBe(3);
  });

  it('keeps each label’s taggers to its own links: no tagger of one label shows under another', () => {
    const merged = mergeOtherLinkTags([
      { link: netflix, tags: [tag('film', ['ann']), tag('movie', ['dan'])] },
      { link: tmdb, tags: [tag('movie', ['eve'])] },
    ]);
    expect(merged.find((entry) => entry.label === 'film')?.taggers).toEqual(['ann']);
    expect(merged.find((entry) => entry.label === 'movie')?.taggers).toEqual(['dan', 'eve']);
  });

  it('orders by taggers, then by links, then by label, and keeps every label', () => {
    const many = Array.from({ length: 23 }, (_, index) => tag(`t${String(index).padStart(2, '0')}`, ['a']));
    const merged = mergeOtherLinkTags([
      { link: netflix, tags: [...many, tag('both', ['a'])] },
      { link: tmdb, tags: [tag('both', ['a'])] },
    ]);
    expect(merged).toHaveLength(24);
    expect(merged[0].label).toBe('both');
    expect(merged[1].label).toBe('t00');
  });

  it('gives OK Computer’s numbers across its links, the viewer counted once where Nexus left them out', () => {
    // Nexus on 2026-11-12 (TASK feed-card-group-tags): Spotify album 2, rock 1; Deezer rock 1; Apple Music
    // album 1 (on its written link); Discogs album 1 (on its written link). The viewer tagged album on Spotify
    // and Apple Music, and Nexus' Spotify sample left them out.
    const viewer = 'viewer';
    const read = (uri: string, name: string, tags: NexusTag[]) => ({
      link: { uri, name },
      tags: withResourceViewerListed(tags, viewer),
    });
    const merged = mergeOtherLinkTags([
      read('https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE', 'Spotify', [
        { ...tag('album', ['b'], 2), relationship: true },
        tag('rock', ['b']),
      ]),
      read('https://www.deezer.com/album/14879699', 'Deezer', [tag('rock', ['f'])]),
      read('https://music.apple.com/us/album/ok-computer/1097861387', 'Apple Music', [
        { ...tag('album', [viewer]), relationship: true },
      ]),
      read('https://www.discogs.com/master/21491-Radiohead-OK-Computer', 'Discogs', [tag('album', ['e'])]),
    ]);

    expect(merged.map(({ label, count, isComplete }) => [label, count, isComplete])).toEqual([
      ['album', 3, true],
      ['rock', 2, true],
    ]);
    expect(merged[0].sources.find((source) => source.name === 'Spotify')?.taggers).toEqual([viewer, 'b']);
  });

  it('marks a label the viewer holds on any of the links, by Nexus’ relationship, also where its sample left them out', () => {
    const merged = mergeOtherLinkTags([
      { link: netflix, tags: [tag('film', ['ann']), { ...tag('noir', ['bob'], 4), relationship: true }] },
      { link: tmdb, tags: [tag('film', ['cy']), tag('noir', ['dee'])] },
    ]);

    expect(merged.map(({ label, relationship }) => [label, relationship])).toEqual([
      ['noir', true],
      ['film', false],
    ]);
  });

  it('is empty when no other link has tags', () => {
    expect(mergeOtherLinkTags([])).toEqual([]);
    expect(mergeOtherLinkTags([{ link: netflix, tags: [] }])).toEqual([]);
  });
});

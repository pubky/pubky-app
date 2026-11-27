import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TPinakesEpisode, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { EPISODES_FILTER_DEBOUNCE_MS, getOlderEpisodesLink, ResourceEpisodesSection } from './ResourceEpisodesSection';

const mocks = vi.hoisted(() => ({
  fetchEpisodes: vi.fn(),
  tagReads: [] as string[],
  tagSpellings: {} as Record<string, string[]>,
  infinite: { onLoadMore: () => {}, hasMore: false, isLoading: false, itemCount: 0, maxUnproductiveLoads: 0 },
  stalled: false,
  resume: vi.fn(),
}));

vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesConfigured: () => true,
}));
vi.mock('@/controllers/pinakes/pinakes', () => ({ PinakesController: { fetchEpisodes: mocks.fetchEpisodes } }));
vi.mock('@/hooks/useInfiniteScroll/useInfiniteScroll', () => ({
  useInfiniteScroll: (options: typeof mocks.infinite) => {
    mocks.infinite = options;
    return { sentinelRef: () => undefined, isStalled: mocks.stalled, resumeAutoLoad: mocks.resume };
  },
}));
vi.mock('@/hooks/useResourceTags/useResourceTags', () => ({
  useResourceTags: (uri: string, options?: { spellings?: string[] }) => {
    mocks.tagReads.push(uri);
    mocks.tagSpellings[uri] = options?.spellings ?? [];
    return {
      tags: [uri, ...(options?.spellings ?? [])].some((link) => link.endsWith('504/'))
        ? [{ label: 'war', taggers: ['a', 'b'], taggers_count: 2, relationship: false, tag_uri: null }]
        : [],
      isLoading: false,
      isAtReadLimit: false,
      isError: false,
      addTag: vi.fn(),
      toggleTag: vi.fn(),
    };
  },
}));
vi.mock('@/hooks/useEnrichedTags/useEnrichedTags', () => ({
  useEnrichedTags: (tags: unknown[]) => ({ enrichedTags: tags }),
}));

const SHOW = asOpaque<TPinakesResourceDetail>({
  id: '5988142d26dde2e4a9e9e5e064d0e9b0',
  uri: 'https://podcasts.apple.com/us/podcast/lex-fridman-podcast/id1434243584',
  name: 'Lex Fridman Podcast',
  image: 'https://cdn.example.com/lex.jpg',
  episodes: [{ uri: 'https://lexfridman.com/episode-504/', guid: 'g504', name: '#504' }],
});

const episode = (n: number): TPinakesEpisode => ({
  uri: `https://lexfridman.com/episode-${n}/`,
  name: `#${n} – Episode ${n}`,
  guid: `g${n}`,
  published: '2026-11-10T23:52:44Z',
  stream: { url: `https://media.example.com/${n}.mp3`, type: 'audio/mpeg', duration_s: 10875, preview: false },
});

const items = () => screen.queryAllByTestId('resource-episode');

const FEED = asOpaque<TPinakesResourceDetail>({
  id: 'faf081897e81377fd45b404f02a7f190',
  uri: 'https://podcast.darknetdiaries.com/',
  site: 'podcast.darknetdiaries.com',
  type: 'PodcastSeries',
  name: 'Darknet Diaries',
  also_on: [
    { uri: 'https://podcastindex.org/podcast/577105', site: 'Podcast Index' },
    { uri: 'https://open.spotify.com/show/4XPl3uEEL9hvqMkoZrzbx5', site: 'Spotify' },
    { uri: 'https://podcasts.apple.com/us/podcast/darknet-diaries/id1296350485', site: 'Apple Podcasts' },
  ],
});

describe('ResourceEpisodesSection', () => {
  beforeEach(() => {
    mocks.fetchEpisodes.mockReset();
    mocks.tagReads = [];
    mocks.tagSpellings = {};
    mocks.stalled = false;
    mocks.resume.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('lists a show’s episodes as rows with their own tags, under the #episodes anchor', async () => {
    mocks.fetchEpisodes.mockResolvedValueOnce({ items: [episode(504), episode(503)], next_offset: 20 });
    render(<ResourceEpisodesSection card={SHOW} />);

    const section = screen.getByRole('region', { name: 'Episodes' });
    expect(section).toHaveAttribute('id', 'episodes');
    await waitFor(() => expect(items()).toHaveLength(2));
    expect(mocks.fetchEpisodes).toHaveBeenCalledWith({ id: SHOW.id, limit: 20, q: null });
    const [first] = items();
    expect(within(first).getByRole('link', { name: '#504 – Episode 504' })).toHaveAttribute(
      'href',
      `/resource?uri=${encodeURIComponent('https://lexfridman.com/episode-504/')}`,
    );
    expect(within(first).getByRole('button', { name: 'Play #504 – Episode 504' })).toBeInTheDocument();
    expect(first).toHaveTextContent('Nov 10, 2026 · 3:01:15');
    // The episode's own tags, read by its link
    expect(within(first).getByRole('group', { name: 'Tags on #504 – Episode 504' })).toHaveTextContent('war');
    expect(mocks.tagReads).toContain('https://lexfridman.com/episode-504/');
  });

  it('shows an episode’s own tags in its row only when it has any, with no "+" on the list', async () => {
    mocks.fetchEpisodes.mockResolvedValueOnce({ items: [episode(504), episode(503)], next_offset: null });
    render(<ResourceEpisodesSection card={SHOW} />);
    await waitFor(() => expect(items()).toHaveLength(2));

    const [tagged, untagged] = items();
    // One line: the row, then the chips at its end (no line of their own under it)
    expect(tagged).toHaveClass('sm:flex-row');
    const tags = within(tagged).getByRole('group', { name: 'Tags on #504 – Episode 504' });
    expect(tags).toHaveTextContent('war');
    // At the row's end, in at most half of it: long labels never squeeze the title away
    expect(tags).toHaveClass('sm:justify-end');
    expect(tagged.lastElementChild).toContainElement(tags);
    expect(tagged.lastElementChild).toHaveClass('sm:max-w-1/2');
    // Nobody tagged #503 (it was read): no tag bar, no empty "+"
    expect(mocks.tagReads).toContain('https://lexfridman.com/episode-503/');
    expect(within(untagged).queryByRole('group', { name: /^Tags on/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add new tag' })).toBeNull();
  });

  it('reads an episode’s tags across its other links (aliases) too', async () => {
    const page = 'https://lexfridman.com/episode-504/';
    const item = 'https://lexfridman.com/feed/podcast/?guid=g504';
    mocks.fetchEpisodes.mockResolvedValueOnce({
      items: [
        // tagged on its page only, listed by its feed item
        { ...episode(502), uri: item, aliases: [page, item] },
        episode(503),
      ],
      next_offset: null,
    });
    render(<ResourceEpisodesSection card={SHOW} />);

    await waitFor(() => expect(items()).toHaveLength(2));
    const [aliased, plain] = items();
    expect(within(aliased).getByRole('group', { name: 'Tags on #502 – Episode 502' })).toHaveTextContent('war');
    // the row's own link once, the other links read along
    expect(mocks.tagSpellings[item]).toEqual([page]);
    // a row without aliases reads its link alone, as before
    expect(within(plain).queryByRole('group')).not.toBeInTheDocument();
    expect(mocks.tagSpellings['https://lexfridman.com/episode-503/']).toEqual([]);
  });

  it('reads and writes an episode’s tags on its link folded as every resource’s, its spelling read along', async () => {
    const written = 'HTTPS://LexFridman.com/episode-505/#t';
    mocks.fetchEpisodes.mockResolvedValueOnce({ items: [{ ...episode(505), uri: written }], next_offset: null });
    render(<ResourceEpisodesSection card={SHOW} />);

    await waitFor(() => expect(items()).toHaveLength(1));
    expect(mocks.tagReads).toContain('https://lexfridman.com/episode-505/');
    expect(mocks.tagReads).not.toContain(written);
    expect(mocks.tagSpellings['https://lexfridman.com/episode-505/']).toEqual([written]);
  });

  it('plays an episode in place on Play, its title still opening the episode’s page', async () => {
    mocks.fetchEpisodes.mockResolvedValueOnce({ items: [episode(504)], next_offset: null });
    const before = window.location.href;
    render(<ResourceEpisodesSection card={SHOW} />);
    await waitFor(() => expect(items()).toHaveLength(1));
    const [row] = items();

    const play = within(row).getByRole('button', { name: 'Play #504 – Episode 504' });
    // Play is no link and no press on it is taken by one (the title's link only covers the row beside it)
    expect(play.closest('a')).toBeNull();
    expect(fireEvent.click(play)).toBe(true);
    expect(window.location.href).toBe(before);
    expect(within(row).getByTestId('resource-player-audio')).toHaveAttribute(
      'src',
      'https://media.example.com/504.mp3',
    );
    expect(
      within(within(row).getByTestId('resource-audio-controls')).getByRole('link', { name: '#504 – Episode 504' }),
    ).toHaveAttribute('href', `/resource?uri=${encodeURIComponent('https://lexfridman.com/episode-504/')}`);
    // The episode's tags stay in its row
    expect(within(row).getByRole('group', { name: 'Tags on #504 – Episode 504' })).toBeInTheDocument();
  });

  it('searches the titles with q once typing settles', async () => {
    mocks.fetchEpisodes
      .mockResolvedValueOnce({ items: [episode(504)], next_offset: 20 })
      .mockResolvedValueOnce({ items: [episode(500)], next_offset: null });
    render(<ResourceEpisodesSection card={SHOW} />);
    await waitFor(() => expect(items()).toHaveLength(1));

    vi.useFakeTimers();
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter episodes' }), { target: { value: 'khabib' } });
    expect(mocks.fetchEpisodes).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(EPISODES_FILTER_DEBOUNCE_MS));
    vi.useRealTimers();

    await waitFor(() => expect(mocks.fetchEpisodes).toHaveBeenLastCalledWith({ id: SHOW.id, limit: 20, q: 'khabib' }));
    await waitFor(() => expect(screen.getByRole('list', { name: 'Episodes matching khabib' })).toBeInTheDocument());
    expect(items().map((item) => within(item).getByRole('link').textContent)).toEqual(['#500 – Episode 500']);
  });

  it('says when no title matches', async () => {
    mocks.fetchEpisodes.mockResolvedValueOnce({ items: [episode(504)] }).mockResolvedValueOnce({ items: [] });
    render(<ResourceEpisodesSection card={SHOW} />);
    await waitFor(() => expect(items()).toHaveLength(1));

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter episodes' }), { target: { value: 'zzz' } });
    await waitFor(() =>
      expect(screen.getByTestId('resource-episodes-message')).toHaveTextContent('No episode titles match “zzz”.'),
    );
  });

  it('reads the next page as the list scrolls to its end, with no Show more', async () => {
    mocks.fetchEpisodes
      .mockResolvedValueOnce({ items: [episode(504)], next_offset: 20 })
      .mockResolvedValueOnce({ items: [episode(503)], next_offset: null });
    render(<ResourceEpisodesSection card={SHOW} />);
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(mocks.infinite.hasMore).toBe(true);
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument();

    // The sentinel at the list's end came into view
    act(() => mocks.infinite.onLoadMore());
    await waitFor(() => expect(items()).toHaveLength(2));
    expect(mocks.fetchEpisodes).toHaveBeenLastCalledWith({ id: SHOW.id, limit: 20, offset: 20, q: null });
    expect(mocks.infinite.hasMore).toBe(false);
  });

  it('offers Try again when a next page could not be read, and appends it then', async () => {
    mocks.fetchEpisodes
      .mockResolvedValueOnce({ items: [episode(504)], next_offset: 20 })
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ items: [episode(503)], next_offset: null });
    render(<ResourceEpisodesSection card={SHOW} />);
    await waitFor(() => expect(items()).toHaveLength(1));

    act(() => mocks.infinite.onLoadMore());
    await waitFor(() => expect(screen.getByTestId('resource-episodes-more-message')).toBeInTheDocument());
    // The scroll trigger is off while the error stands: no loop of failing reads
    expect(mocks.infinite.hasMore).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(items()).toHaveLength(2));
    expect(screen.queryByTestId('resource-episodes-more-message')).toBeNull();
  });

  it('offers Try again when the episodes could not be read', async () => {
    mocks.fetchEpisodes.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ items: [episode(504)] });
    render(<ResourceEpisodesSection card={SHOW} />);

    await waitFor(() =>
      expect(screen.getByTestId('resource-episodes-message')).toHaveTextContent('could not be loaded'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(items()).toHaveLength(1));
  });

  it('counts its rows for the scroll budget, and offers Load more once pages stop adding any', async () => {
    mocks.fetchEpisodes.mockResolvedValueOnce({ items: [episode(504), episode(503)], next_offset: 20 });
    const { rerender } = render(<ResourceEpisodesSection card={SHOW} />);
    await waitFor(() => expect(items()).toHaveLength(2));
    expect(mocks.infinite.itemCount).toBe(2);
    expect(mocks.infinite.maxUnproductiveLoads).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();

    mocks.stalled = true;
    rerender(<ResourceEpisodesSection card={{ ...SHOW }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(mocks.resume).toHaveBeenCalledTimes(1);
  });

  it('lists an episode without audio that plays here with its title link, date and length, and no Play', async () => {
    const silent = {
      ...episode(400),
      stream: { url: 'ftp://example.com/400.mp3', type: 'audio/mpeg', duration_s: 60, preview: false },
    };
    mocks.fetchEpisodes.mockResolvedValueOnce({ items: [silent] });
    render(<ResourceEpisodesSection card={SHOW} />);

    const row = await screen.findByTestId('resource-episode-no-audio');
    expect(within(row).getByRole('link', { name: '#400 – Episode 400' })).toHaveAttribute(
      'href',
      `/resource?uri=${encodeURIComponent('https://lexfridman.com/episode-400/')}`,
    );
    expect(row).toHaveTextContent('Nov 10, 2026 · 1:00');
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('lists the episodes of a show whose card has no latest ones', async () => {
    mocks.fetchEpisodes.mockResolvedValueOnce({ items: [episode(504)] });
    render(<ResourceEpisodesSection card={{ ...SHOW, type: 'PodcastSeries', episodes: [] }} />);

    await waitFor(() => expect(items()).toHaveLength(1));
  });

  it('shows nothing for a card that is no show', () => {
    const { container } = render(<ResourceEpisodesSection card={{ ...SHOW, episodes: null }} />);

    expect(container).toBeEmptyDOMElement();
    expect(mocks.fetchEpisodes).not.toHaveBeenCalled();
  });
  it('ends a list the feed lists more of with the show on its own service, once its last page is read', async () => {
    mocks.fetchEpisodes
      .mockResolvedValueOnce({ items: [episode(504)], next_offset: 20, truncated: true })
      .mockResolvedValueOnce({ items: [episode(503)], next_offset: null, truncated: true });
    render(<ResourceEpisodesSection card={FEED} />);
    await waitFor(() => expect(items()).toHaveLength(1));
    // More pages to come: not yet
    expect(screen.queryByTestId('resource-episodes-older')).toBeNull();

    await act(async () => mocks.infinite.onLoadMore());
    await waitFor(() => expect(items()).toHaveLength(2));
    const older = screen.getByTestId('resource-episodes-older');
    // The last row of the list, as an episode row: the service's icon in Play's place, no line under it
    expect(screen.getByRole('list', { name: 'All episodes' }).lastElementChild).toBe(older);
    const link = within(older).getByRole('link', { name: 'Older episodes on Spotify' });
    expect(link).toHaveAttribute('href', 'https://open.spotify.com/show/4XPl3uEEL9hvqMkoZrzbx5');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(older).getByTestId('play-stand-in-icon')).toHaveAttribute('aria-hidden', 'true');
    expect(within(older).queryByRole('button')).toBeNull();
    expect(older.textContent).toBe('Older episodes on Spotify');
  });

  it('lists no older-episodes row when the feed has none past the list, or with an older Pinakes', async () => {
    mocks.fetchEpisodes.mockResolvedValueOnce({ items: [episode(504)], next_offset: null, truncated: false });
    const { unmount } = render(<ResourceEpisodesSection card={FEED} />);
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(screen.queryByTestId('resource-episodes-older')).toBeNull();
    unmount();

    mocks.fetchEpisodes.mockResolvedValueOnce({ items: [episode(504)], next_offset: null });
    render(<ResourceEpisodesSection card={FEED} />);
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(screen.queryByTestId('resource-episodes-older')).toBeNull();
  });

  it('opens older episodes on Apple Podcasts or Spotify first, else the card’s own link, never a maybe link', () => {
    // The card's own link first when it is one of them
    expect(
      getOlderEpisodesLink({ ...FEED, uri: FEED.also_on[2].uri, site: 'Apple Podcasts', also_on: FEED.also_on }),
    ).toEqual({ url: FEED.also_on[2].uri, name: 'Apple Podcasts' });
    // Else the first of them in Also on
    expect(getOlderEpisodesLink(FEED)).toEqual({ url: FEED.also_on[1].uri, name: 'Spotify' });
    // A match by metadata may be another show
    expect(
      getOlderEpisodesLink({
        ...FEED,
        also_on: [
          { uri: 'https://open.spotify.com/show/other', site: 'Spotify', derived: true, kind: 'maybe' },
          FEED.also_on[0],
        ],
      }),
    ).toEqual({ url: FEED.uri, name: 'podcast.darknetdiaries.com' });
    // Neither: the card's own web link, else the first web link in Also on
    expect(getOlderEpisodesLink({ ...FEED, also_on: [] })).toEqual({
      url: FEED.uri,
      name: 'podcast.darknetdiaries.com',
    });
    expect(
      getOlderEpisodesLink({ ...FEED, uri: 'isbn:9780000000000', site: null, also_on: [FEED.also_on[0]] }),
    ).toEqual({
      url: FEED.also_on[0].uri,
      name: 'Podcast Index',
    });
    expect(getOlderEpisodesLink({ ...FEED, uri: 'isbn:9780000000000', site: null, also_on: [] })).toBeNull();
  });
});

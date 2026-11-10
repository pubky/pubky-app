import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { useOtherLinkTags } from './useOtherLinkTags';
import type { TOtherLink } from './useOtherLinkTags.types';

const mocks = vi.hoisted(() => ({ viewerId: 'viewer' as string | null, fetchResourceTags: vi.fn() }));

vi.mock('@/controllers/tag/tag', () => ({ TagController: { fetchResourceTags: mocks.fetchResourceTags } }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (select: (state: { currentUserPubky: string | null }) => unknown) =>
    select({ currentUserPubky: mocks.viewerId }),
}));

const NETFLIX: TOtherLink = { uri: 'https://www.netflix.com/title/20557937', name: 'Netflix' };
const TMDB: TOtherLink = { uri: 'https://www.themoviedb.org/movie/603', name: 'TMDB' };
const IMDB: TOtherLink = { uri: 'https://www.imdb.com/title/tt0133093/', name: 'IMDb' };

const tag = (label: string, taggers: string[]): NexusTag => ({
  label,
  taggers,
  taggers_count: taggers.length,
  relationship: false,
  tag_uri: null,
});

const TAGS: Record<string, NexusTag[]> = {
  [NETFLIX.uri]: [tag('film', ['ann'])],
  [TMDB.uri]: [tag('film', ['bob']), tag('scifi', ['bob'])],
  [IMDB.uri]: [],
};

describe('useOtherLinkTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewerId = 'viewer';
    mocks.fetchResourceTags.mockImplementation(({ uri }: { uri: string }) => Promise.resolve(TAGS[uri] ?? []));
  });

  it('reads each link exactly as written, for the viewer, and keeps every answer with its own link', async () => {
    const links = [NETFLIX, TMDB, IMDB];
    const { result } = renderHook(() => useOtherLinkTags(links));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.fetchResourceTags.mock.calls.map(([params]) => params)).toEqual([
      { uri: NETFLIX.uri, viewerId: 'viewer' },
      { uri: TMDB.uri, viewerId: 'viewer' },
      { uri: IMDB.uri, viewerId: 'viewer' },
    ]);
    // A link without tags is left out.
    expect(result.current.reads).toEqual([
      { link: NETFLIX, tags: TAGS[NETFLIX.uri] },
      { link: TMDB, tags: TAGS[TMDB.uri] },
    ]);
  });

  it('leaves out a link whose read failed', async () => {
    mocks.fetchResourceTags.mockImplementation(({ uri }: { uri: string }) =>
      uri === NETFLIX.uri ? Promise.reject(new Error('nexus down')) : Promise.resolve(TAGS[uri] ?? []),
    );
    const links = [NETFLIX, TMDB];
    const { result } = renderHook(() => useOtherLinkTags(links));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.reads.map((read) => read.link)).toEqual([TMDB]);
  });

  it('asks every link at once and shows the answers as they arrive, in link order', async () => {
    const links = Array.from({ length: 8 }, (_, index) => ({ uri: `https://e.com/${index}`, name: 'e.com' }));
    const pending = new Map<string, () => void>();
    mocks.fetchResourceTags.mockImplementation(
      ({ uri }: { uri: string }) =>
        new Promise<NexusTag[]>((resolve) => {
          pending.set(uri, () => resolve([tag(uri.slice(-1), ['a'])]));
        }),
    );
    const { result } = renderHook(() => useOtherLinkTags(links));

    expect(mocks.fetchResourceTags).toHaveBeenCalledTimes(links.length);
    expect(result.current.isLoading).toBe(true);
    // A link read later (`by-uri` after a cut-off batch view) does not hold back the others.
    await act(async () => links.slice(2).forEach((link) => pending.get(link.uri)?.()));
    await waitFor(() => expect(result.current.reads).toHaveLength(links.length - 2));
    expect(result.current.isLoading).toBe(false);
    await act(async () => links.slice(0, 2).forEach((link) => pending.get(link.uri)?.()));
    await waitFor(() => expect(result.current.reads).toHaveLength(links.length));
    expect(result.current.reads.map((read) => read.link)).toEqual(links);
  });

  it('stops loading once every link answered, all without tags', async () => {
    mocks.fetchResourceTags.mockResolvedValue([]);
    const { result } = renderHook(() => useOtherLinkTags([IMDB, NETFLIX]));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.reads).toEqual([]);
  });

  it('never shows a late answer for links it no longer reads', async () => {
    let resolveFirst: (tags: NexusTag[]) => void = () => {};
    mocks.fetchResourceTags.mockImplementation(({ uri }: { uri: string }) =>
      uri === NETFLIX.uri
        ? new Promise<NexusTag[]>((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve(TAGS[uri] ?? []),
    );
    const first = [NETFLIX];
    const second = [TMDB];
    const { result, rerender } = renderHook(({ links }) => useOtherLinkTags(links), { initialProps: { links: first } });

    rerender({ links: second });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => resolveFirst([tag('late', ['z'])]));
    expect(result.current.reads).toEqual([{ link: TMDB, tags: TAGS[TMDB.uri] }]);
  });

  it('reads again only when the links or the viewer change, not for a new array of the same links', async () => {
    const { result, rerender } = renderHook(({ links }) => useOtherLinkTags(links), {
      initialProps: { links: [NETFLIX, TMDB] },
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.fetchResourceTags).toHaveBeenCalledTimes(2);

    rerender({ links: [{ ...NETFLIX }, { ...TMDB }] });
    expect(mocks.fetchResourceTags).toHaveBeenCalledTimes(2);
    expect(result.current.reads).toHaveLength(2);

    mocks.viewerId = 'someone-else';
    rerender({ links: [NETFLIX, TMDB] });
    await waitFor(() => expect(mocks.fetchResourceTags).toHaveBeenCalledTimes(4));
    expect(mocks.fetchResourceTags).toHaveBeenLastCalledWith({ uri: TMDB.uri, viewerId: 'someone-else' });
  });

  it('reads nothing without other links', () => {
    const { result } = renderHook(() => useOtherLinkTags([]));
    expect(mocks.fetchResourceTags).not.toHaveBeenCalled();
    expect(result.current).toEqual({ reads: [], isLoading: false });
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import { PostController } from '@/controllers/post/post';
import { UserController } from '@/controllers/user/user';
import type { NexusTaggers } from '@/services/nexus/nexus.types';
import { useEntityTaggers } from './useEntityTaggers';
import { TAGGERS_MAX_SKIP, TAGGERS_PAGE_SIZE } from './useEntityTaggers.constants';

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    fetchTaggers: vi.fn(),
  },
}));

vi.mock('@/controllers/user/user', () => ({
  UserController: {
    fetchTaggers: vi.fn(),
  },
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: { error: vi.fn() },
}));

const page = (users: string[]): NexusTaggers => ({ users, relationship: false });
const fullPage = (prefix: string) => Array.from({ length: TAGGERS_PAGE_SIZE }, (_, index) => `${prefix}-${index}`);

describe('useEntityTaggers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stays disabled without complete entity context', async () => {
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', null));

    await act(async () => {
      await result.current.loadTaggers('bitcoin', 2);
      await result.current.loadMoreTaggers('bitcoin');
    });

    expect(result.current.taggersByLabel.size).toBe(0);
    expect(PostController.fetchTaggers).not.toHaveBeenCalled();
    expect(UserController.fetchTaggers).not.toHaveBeenCalled();
  });

  it('fetches the first page of post taggers from the post controller', async () => {
    vi.mocked(PostController.fetchTaggers).mockResolvedValue(page(['tagger-1', 'tagger-2']));
    const { result } = renderHook(() => useEntityTaggers('author:post-id', TagKind.POST));

    await act(async () => {
      await result.current.loadTaggers('Bitcoin', 2);
    });

    expect(PostController.fetchTaggers).toHaveBeenCalledWith({
      compositeId: 'author:post-id',
      label: 'Bitcoin',
      skip: 0,
      limit: TAGGERS_PAGE_SIZE,
    });
    expect(UserController.fetchTaggers).not.toHaveBeenCalled();
    expect(result.current.taggersByLabel.get('bitcoin')).toEqual(['tagger-1', 'tagger-2']);
    expect(result.current.taggerStates.get('bitcoin')).toMatchObject({
      skip: 2,
      isLoading: false,
      hasMore: false,
      hasFetched: true,
      totalCount: 2,
    });
  });

  it('fetches profile taggers from the user controller and pages on demand', async () => {
    const firstPage = fullPage('first');
    vi.mocked(UserController.fetchTaggers)
      .mockResolvedValueOnce(page(firstPage))
      .mockResolvedValueOnce(page(['last-1', 'last-2']));
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', TagKind.USER));

    await act(async () => {
      await result.current.loadTaggers('Synonym', TAGGERS_PAGE_SIZE + 2);
    });

    expect(UserController.fetchTaggers).toHaveBeenNthCalledWith(1, {
      user_id: 'profile-pubky',
      label: 'Synonym',
      skip: 0,
      limit: TAGGERS_PAGE_SIZE,
    });
    expect(result.current.taggerStates.get('synonym')).toMatchObject({ hasMore: true, skip: TAGGERS_PAGE_SIZE });

    await act(async () => {
      await result.current.loadMoreTaggers('Synonym');
    });

    expect(UserController.fetchTaggers).toHaveBeenNthCalledWith(2, {
      user_id: 'profile-pubky',
      label: 'Synonym',
      skip: TAGGERS_PAGE_SIZE,
      limit: TAGGERS_PAGE_SIZE,
    });
    expect(PostController.fetchTaggers).not.toHaveBeenCalled();
    expect(result.current.taggersByLabel.get('synonym')).toEqual([...firstPage, 'last-1', 'last-2']);
    expect(result.current.taggerStates.get('synonym')).toMatchObject({ hasMore: false, hasFetched: true });
  });

  it('stops paging once the known total count is reached', async () => {
    vi.mocked(UserController.fetchTaggers).mockResolvedValue(page(fullPage('only')));
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', TagKind.USER));

    await act(async () => {
      await result.current.loadTaggers('bitcoin', TAGGERS_PAGE_SIZE);
    });
    await act(async () => {
      await result.current.loadMoreTaggers('bitcoin');
    });

    expect(UserController.fetchTaggers).toHaveBeenCalledTimes(1);
    expect(result.current.taggerStates.get('bitcoin')?.hasMore).toBe(false);
  });

  it('stops paging before the Nexus skip limit', async () => {
    vi.mocked(UserController.fetchTaggers).mockResolvedValue(page(fullPage('any')));
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', TagKind.USER));

    await act(async () => {
      await result.current.loadTaggers('bitcoin');
    });
    const pagesUntilLimit = TAGGERS_MAX_SKIP / TAGGERS_PAGE_SIZE;
    for (let index = 1; index < pagesUntilLimit + 3; index += 1) {
      await act(async () => {
        await result.current.loadMoreTaggers('bitcoin');
      });
    }

    expect(UserController.fetchTaggers).toHaveBeenCalledTimes(pagesUntilLimit);
    expect(result.current.taggerStates.get('bitcoin')).toMatchObject({ hasMore: false, skip: TAGGERS_MAX_SKIP });
  });

  it('deduplicates taggers across pages', async () => {
    vi.mocked(UserController.fetchTaggers)
      .mockResolvedValueOnce(page(fullPage('dup')))
      .mockResolvedValueOnce(page(['dup-0', 'dup-1', 'fresh']));
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', TagKind.USER));

    await act(async () => {
      await result.current.loadTaggers('bitcoin');
    });
    await act(async () => {
      await result.current.loadMoreTaggers('bitcoin');
    });

    expect(result.current.taggersByLabel.get('bitcoin')).toEqual([...fullPage('dup'), 'fresh']);
  });

  it('reuses a fetched page for the same total count', async () => {
    vi.mocked(UserController.fetchTaggers).mockResolvedValue(page(['tagger-1']));
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', TagKind.USER));

    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1);
    });
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1);
    });

    expect(UserController.fetchTaggers).toHaveBeenCalledTimes(1);
  });

  it('re-syncs from the first page when the total count changes', async () => {
    vi.mocked(UserController.fetchTaggers)
      .mockResolvedValueOnce(page(['tagger-1']))
      .mockResolvedValueOnce(page(['tagger-1', 'tagger-2']));
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', TagKind.USER));

    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1);
    });
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 2);
    });

    expect(UserController.fetchTaggers).toHaveBeenCalledTimes(2);
    expect(UserController.fetchTaggers).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 }));
    expect(result.current.taggersByLabel.get('bitcoin')).toEqual(['tagger-1', 'tagger-2']);
  });

  it('keeps already fetched pages and stays retryable when a page fails', async () => {
    const firstPage = fullPage('kept');
    vi.mocked(UserController.fetchTaggers)
      .mockResolvedValueOnce(page(firstPage))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(page(['after-retry']));
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', TagKind.USER));

    await act(async () => {
      await result.current.loadTaggers('bitcoin');
    });
    await act(async () => {
      await result.current.loadMoreTaggers('bitcoin');
    });

    expect(result.current.taggersByLabel.get('bitcoin')).toEqual(firstPage);
    expect(result.current.taggerStates.get('bitcoin')).toMatchObject({
      isLoading: false,
      hasMore: true,
      skip: TAGGERS_PAGE_SIZE,
    });

    await act(async () => {
      await result.current.loadMoreTaggers('bitcoin');
    });

    expect(UserController.fetchTaggers).toHaveBeenLastCalledWith(expect.objectContaining({ skip: TAGGERS_PAGE_SIZE }));
    expect(result.current.taggersByLabel.get('bitcoin')).toEqual([...firstPage, 'after-retry']);
  });

  it('ignores concurrent calls for a label that is already loading', async () => {
    let resolveRequest: (value: NexusTaggers) => void = () => {};
    vi.mocked(UserController.fetchTaggers).mockReturnValue(
      new Promise<NexusTaggers>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', TagKind.USER));

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.loadTaggers('bitcoin', 1);
    });
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1);
      await result.current.loadMoreTaggers('bitcoin');
    });
    await act(async () => {
      resolveRequest(page(['tagger-1']));
      await first;
    });

    expect(UserController.fetchTaggers).toHaveBeenCalledTimes(1);
  });

  it('does not let a stale response overwrite the next entity', async () => {
    let resolveStale: (value: NexusTaggers) => void = () => {};
    vi.mocked(UserController.fetchTaggers)
      .mockReturnValueOnce(
        new Promise<NexusTaggers>((resolve) => {
          resolveStale = resolve;
        }),
      )
      .mockResolvedValueOnce(page(['fresh-tagger']));

    const { result, rerender } = renderHook(
      ({ taggedId }: { taggedId: string }) => useEntityTaggers(taggedId, TagKind.USER),
      { initialProps: { taggedId: 'first-profile' } },
    );

    let staleRequest: Promise<void> = Promise.resolve();
    act(() => {
      staleRequest = result.current.loadTaggers('bitcoin', 1);
    });
    await waitFor(() => {
      expect(UserController.fetchTaggers).toHaveBeenCalledTimes(1);
    });

    rerender({ taggedId: 'second-profile' });
    expect(result.current.taggersByLabel.size).toBe(0);

    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1);
    });
    await act(async () => {
      resolveStale(page(['stale-tagger']));
      await staleRequest;
    });

    expect(result.current.taggersByLabel.get('bitcoin')).toEqual(['fresh-tagger']);
    expect(result.current.taggerStates.get('bitcoin')?.isLoading).toBe(false);
  });
});

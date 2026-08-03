import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { useStreamInvalidationStore } from '@/stores/streamInvalidation/streamInvalidation.store';
import { useFollowDependentStreamRefresh } from './useFollowDependentStreamRefresh';

function asStreamId(streamId: string): PostStreamId {
  return streamId as PostStreamId;
}

describe('useFollowDependentStreamRefresh', () => {
  beforeEach(() => {
    useStreamInvalidationStore.getState().reset();
  });

  it('does not refresh on mount and refreshes a graph stream after its revision advances', async () => {
    const refreshFromNetwork = vi.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useFollowDependentStreamRefresh({
        streamId: asStreamId('timeline:wot:all'),
        refreshFromNetwork,
      }),
    );

    expect(refreshFromNetwork).not.toHaveBeenCalled();

    act(() => {
      useStreamInvalidationStore.getState().invalidateFollowDependentStreams({ includeFriends: false });
    });

    await waitFor(() => expect(refreshFromNetwork).toHaveBeenCalledOnce());
  });

  it('refreshes Friends only when the friendship revision advances', async () => {
    const refreshFromNetwork = vi.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useFollowDependentStreamRefresh({
        streamId: asStreamId('timeline:friends:all'),
        refreshFromNetwork,
      }),
    );

    act(() => {
      useStreamInvalidationStore.getState().invalidateFollowDependentStreams({ includeFriends: false });
    });
    expect(refreshFromNetwork).not.toHaveBeenCalled();

    act(() => {
      useStreamInvalidationStore.getState().invalidateFollowDependentStreams({ includeFriends: true });
    });
    await waitFor(() => expect(refreshFromNetwork).toHaveBeenCalledOnce());
  });

  it.each([
    'timeline:all:all',
    'timeline:wot_domain:0:all:developer',
    'timeline:author:viewer-pubky:all',
    'author:viewer-pubky',
    'timeline:bookmarks:all',
    'post_replies:author-pubky:post-id',
  ])('does not refresh unrelated mounted stream %s', async (streamId) => {
    const refreshFromNetwork = vi.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useFollowDependentStreamRefresh({
        streamId: asStreamId(streamId),
        refreshFromNetwork,
      }),
    );

    act(() => {
      useStreamInvalidationStore.getState().invalidateFollowDependentStreams({ includeFriends: true });
    });

    await Promise.resolve();
    expect(refreshFromNetwork).not.toHaveBeenCalled();
  });

  it('baselines a newly selected stream instead of duplicating its initial load', async () => {
    const refreshFromNetwork = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ streamId }) => useFollowDependentStreamRefresh({ streamId, refreshFromNetwork }),
      { initialProps: { streamId: asStreamId('timeline:all:all') } },
    );

    act(() => {
      useStreamInvalidationStore.getState().invalidateFollowDependentStreams({ includeFriends: false });
    });
    rerender({ streamId: asStreamId('timeline:wot:all') });

    expect(refreshFromNetwork).not.toHaveBeenCalled();

    act(() => {
      useStreamInvalidationStore.getState().invalidateFollowDependentStreams({ includeFriends: false });
    });
    await waitFor(() => expect(refreshFromNetwork).toHaveBeenCalledOnce());
  });

  it('serializes and coalesces revisions that arrive during a refresh', async () => {
    let resolveFirstRefresh: (() => void) | undefined;
    const firstRefresh = new Promise<void>((resolve) => {
      resolveFirstRefresh = resolve;
    });
    const refreshFromNetwork = vi.fn().mockReturnValueOnce(firstRefresh).mockResolvedValue(undefined);
    renderHook(() =>
      useFollowDependentStreamRefresh({
        streamId: asStreamId('total_engagement:wot_domain:2:all:developer'),
        refreshFromNetwork,
      }),
    );

    act(() => {
      useStreamInvalidationStore.getState().invalidateFollowDependentStreams({ includeFriends: false });
    });
    await waitFor(() => expect(refreshFromNetwork).toHaveBeenCalledOnce());

    act(() => {
      useStreamInvalidationStore.getState().invalidateFollowDependentStreams({ includeFriends: false });
      useStreamInvalidationStore.getState().invalidateFollowDependentStreams({ includeFriends: false });
    });
    expect(refreshFromNetwork).toHaveBeenCalledOnce();

    resolveFirstRefresh?.();
    await waitFor(() => expect(refreshFromNetwork).toHaveBeenCalledTimes(2));
  });
});

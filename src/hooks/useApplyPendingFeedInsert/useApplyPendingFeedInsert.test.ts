import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFeedOptimisticStore } from '@/stores/feedOptimistic/feedOptimistic.store';
import { useApplyPendingFeedInsert } from './useApplyPendingFeedInsert';

describe('useApplyPendingFeedInsert', () => {
  afterEach(() => {
    useFeedOptimisticStore.setState({ pendingByKey: {} });
  });

  it('applies pending ids already queued for the key, then clears them', () => {
    useFeedOptimisticStore.setState({ pendingByKey: { bookmarks: ['a:1', 'a:2'] } });
    const prepend = vi.fn();

    renderHook(() => useApplyPendingFeedInsert('bookmarks', prepend));

    expect(prepend).toHaveBeenCalledWith(['a:1', 'a:2']);
    expect(useFeedOptimisticStore.getState().pendingByKey.bookmarks).toBeUndefined();
  });

  it('reacts to ids enqueued after mount', () => {
    const prepend = vi.fn();
    renderHook(() => useApplyPendingFeedInsert('bookmarks', prepend));
    expect(prepend).not.toHaveBeenCalled();

    act(() => {
      useFeedOptimisticStore.getState().enqueue('bookmarks', 'a:9');
    });

    expect(prepend).toHaveBeenCalledWith(['a:9']);
    expect(useFeedOptimisticStore.getState().pendingByKey.bookmarks).toBeUndefined();
  });

  it('does nothing when there are no pending ids for the key', () => {
    const prepend = vi.fn();
    renderHook(() => useApplyPendingFeedInsert('collection:x', prepend));
    expect(prepend).not.toHaveBeenCalled();
  });

  it('is disabled and leaves the queue untouched when the key is undefined', () => {
    useFeedOptimisticStore.setState({ pendingByKey: { bookmarks: ['a:1'] } });
    const prepend = vi.fn();

    renderHook(() => useApplyPendingFeedInsert(undefined, prepend));

    expect(prepend).not.toHaveBeenCalled();
    expect(useFeedOptimisticStore.getState().pendingByKey.bookmarks).toEqual(['a:1']);
  });
});

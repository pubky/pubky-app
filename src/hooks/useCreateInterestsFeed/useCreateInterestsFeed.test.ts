import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INTERESTS_FEED_NAME } from '@/config/feed';
import { toast } from '@/molecules/Toaster/toast';
import { useCreateInterestsFeed } from './useCreateInterestsFeed';
import { buildInterestsFeedParams } from './useCreateInterestsFeed.utils';

const mocks = vi.hoisted(() => ({
  commitCreate: vi.fn(),
  commitUpdate: vi.fn(),
  getList: vi.fn(),
}));

vi.mock('@/controllers/feed/feed', () => ({
  FeedController: {
    commitCreate: (...args: unknown[]) => mocks.commitCreate(...args),
    commitUpdate: (...args: unknown[]) => mocks.commitUpdate(...args),
    getList: (...args: unknown[]) => mocks.getList(...args),
  },
}));

vi.mock('@/molecules/Toaster/toast');

describe('useCreateInterestsFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getList.mockResolvedValue([]);
    mocks.commitCreate.mockResolvedValue({ id: 'feed-interests' });
    mocks.commitUpdate.mockResolvedValue({ id: 'feed-interests-2' });
  });

  it('creates the feed from the chosen tags and resolves true', async () => {
    const { result } = renderHook(() => useCreateInterestsFeed());

    let created: boolean | undefined;
    await act(async () => {
      created = await result.current.createInterestsFeed(['bitcoin', 'privacy']);
    });

    expect(created).toBe(true);
    expect(mocks.commitCreate).toHaveBeenCalledTimes(1);
    expect(mocks.commitCreate).toHaveBeenCalledWith(buildInterestsFeedParams(['bitcoin', 'privacy']));
    expect(toast).not.toHaveBeenCalled();
    expect(result.current.isCreating).toBe(false);
  });

  it('updates an existing Interests feed in place instead of creating a second one', async () => {
    // A failed homeserver write leaves the local row behind; a retry with a changed selection
    // must not add a second Interests tab under a new config-derived ID.
    mocks.getList.mockResolvedValue([
      { id: 'feed-interests', name: INTERESTS_FEED_NAME, tags: ['bitcoin'] },
      { id: 'feed-other', name: 'Other', tags: ['nostr'] },
    ]);
    const { result } = renderHook(() => useCreateInterestsFeed());

    let created: boolean | undefined;
    await act(async () => {
      created = await result.current.createInterestsFeed(['bitcoin', 'privacy']);
    });

    expect(created).toBe(true);
    expect(mocks.commitUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.commitUpdate).toHaveBeenCalledWith({
      feedId: 'feed-interests',
      changes: { tags: ['bitcoin', 'privacy'] },
    });
    expect(mocks.commitCreate).not.toHaveBeenCalled();
  });

  it('does nothing without tags', async () => {
    const { result } = renderHook(() => useCreateInterestsFeed());

    let created: boolean | undefined;
    await act(async () => {
      created = await result.current.createInterestsFeed([]);
    });

    expect(created).toBe(false);
    expect(mocks.commitCreate).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('reports creating while the controller round-trip is in flight', async () => {
    let resolveCreate: (value: unknown) => void = () => {};
    mocks.commitCreate.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)));
    const { result } = renderHook(() => useCreateInterestsFeed());

    let pending: Promise<boolean> | undefined;
    act(() => {
      pending = result.current.createInterestsFeed(['bitcoin']);
    });

    expect(result.current.isCreating).toBe(true);

    await act(async () => {
      resolveCreate({ id: 'feed-interests' });
      await pending;
    });

    expect(result.current.isCreating).toBe(false);
  });

  it('ignores a second call while one is already in flight', async () => {
    let resolveCreate: (value: unknown) => void = () => {};
    mocks.commitCreate.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)));
    const { result } = renderHook(() => useCreateInterestsFeed());

    let first: Promise<boolean> | undefined;
    let second: boolean | undefined;
    await act(async () => {
      first = result.current.createInterestsFeed(['bitcoin']);
      second = await result.current.createInterestsFeed(['bitcoin']);
    });

    expect(second).toBe(false);
    expect(mocks.commitCreate).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate({ id: 'feed-interests' });
      await expect(first).resolves.toBe(true);
    });
  });

  it('toasts and resolves false when the controller fails, without rejecting', async () => {
    mocks.commitCreate.mockRejectedValue(new Error('homeserver down'));
    const { result } = renderHook(() => useCreateInterestsFeed());

    let created: boolean | undefined;
    await act(async () => {
      created = await result.current.createInterestsFeed(['bitcoin']);
    });

    expect(created).toBe(false);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
    expect(result.current.isCreating).toBe(false);
  });
});

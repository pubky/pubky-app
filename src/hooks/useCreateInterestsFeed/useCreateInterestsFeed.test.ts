import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/molecules/Toaster/toast';
import { useCreateInterestsFeed } from './useCreateInterestsFeed';
import { buildInterestsFeedParams } from './useCreateInterestsFeed.utils';

const mocks = vi.hoisted(() => ({
  commitCreate: vi.fn(),
}));

vi.mock('@/controllers/feed/feed', () => ({
  FeedController: {
    commitCreate: (...args: unknown[]) => mocks.commitCreate(...args),
  },
}));

vi.mock('@/molecules/Toaster/toast');

describe('useCreateInterestsFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.commitCreate.mockResolvedValue({ id: 'feed-interests' });
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

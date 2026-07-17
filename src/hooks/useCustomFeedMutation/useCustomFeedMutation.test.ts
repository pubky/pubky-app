import { act, renderHook } from '@testing-library/react';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedController } from '@/controllers/feed/feed';
import { useCustomFeedMutation } from './useCustomFeedMutation';

vi.mock('@/controllers/feed/feed', () => ({
  FeedController: {
    commitCreate: vi.fn(),
    commitUpdate: vi.fn(),
    commitDelete: vi.fn(),
  },
}));

describe('useCustomFeedMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes commit mutations through the controller boundary', async () => {
    const createParams = {
      name: 'Network feed',
      tags: [],
      domain_tags: ['bitcoiner'],
      reach: PubkyAppFeedReach.Wot,
      sort: PubkyAppFeedSort.Recent,
      content: null,
      layout: PubkyAppFeedLayout.Columns,
    };
    const { result } = renderHook(() => useCustomFeedMutation());

    await act(() => result.current.commitCreate(createParams));
    await act(() => result.current.commitUpdate({ feedId: 'feed-id', changes: { domain_tags: ['developer'] } }));
    await act(() => result.current.commitDelete({ feedId: 'feed-id' }));

    expect(FeedController.commitCreate).toHaveBeenCalledWith(createParams);
    expect(FeedController.commitUpdate).toHaveBeenCalledWith({
      feedId: 'feed-id',
      changes: { domain_tags: ['developer'] },
    });
    expect(FeedController.commitDelete).toHaveBeenCalledWith({ feedId: 'feed-id' });
  });

  it('owns loading state and resets it after a failed mutation', async () => {
    let rejectMutation!: (error: Error) => void;
    vi.mocked(FeedController.commitDelete).mockReturnValue(
      new Promise((_, reject) => {
        rejectMutation = reject;
      }),
    );
    const { result } = renderHook(() => useCustomFeedMutation());

    let mutation!: Promise<void>;
    act(() => {
      mutation = result.current.commitDelete({ feedId: 'feed-id' });
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      rejectMutation(new Error('delete failed'));
      await expect(mutation).rejects.toThrow('delete failed');
    });
    expect(result.current.loading).toBe(false);
  });
});

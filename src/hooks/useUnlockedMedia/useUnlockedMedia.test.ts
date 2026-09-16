import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import type { ReplicatedPost, TUnlockedAttachment } from '@/services/locks/locks.types';
import { useUnlockedMedia } from './useUnlockedMedia';

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: { fetchReplicatedAttachments: vi.fn().mockResolvedValue([]) },
}));

const post: ReplicatedPost = {
  content: 'first',
  kind: 'image',
  attachments: [{ url: 'pubky://reader/priv/social/unlocked/LOCK1/img1', content_type: 'image/png' }],
};

describe('useUnlockedMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(LocksController.fetchReplicatedAttachments).mockResolvedValue([]);
  });

  it('does not redownload unchanged attachments when the list refreshes the post object', async () => {
    const { rerender } = renderHook(({ current }) => useUnlockedMedia(current), { initialProps: { current: post } });
    await waitFor(() => expect(LocksController.fetchReplicatedAttachments).toHaveBeenCalledOnce());

    rerender({ current: { ...post, content: 'refreshed', attachments: [...post.attachments!] } });
    expect(LocksController.fetchReplicatedAttachments).toHaveBeenCalledOnce();

    rerender({
      current: {
        ...post,
        attachments: [{ url: 'pubky://reader/priv/social/unlocked/LOCK1/img2', content_type: 'image/png' }],
      },
    });
    await waitFor(() => expect(LocksController.fetchReplicatedAttachments).toHaveBeenCalledTimes(2));
  });

  it('uses the pending media read when the post object changes before it finishes', async () => {
    let resolveRead!: (attachments: TUnlockedAttachment[]) => void;
    vi.mocked(LocksController.fetchReplicatedAttachments).mockImplementationOnce(
      () => new Promise((resolve) => (resolveRead = resolve)),
    );
    const { result, rerender } = renderHook(({ current }) => useUnlockedMedia(current), {
      initialProps: { current: post },
    });
    rerender({ current: { ...post, content: 'refreshed', attachments: [...post.attachments!] } });
    await act(async () => resolveRead([{ id: 'img1', contentType: 'image/png', bytes: new Uint8Array([1]) }]));

    expect(LocksController.fetchReplicatedAttachments).toHaveBeenCalledOnce();
    expect(result.current).toHaveLength(1);
  });
});

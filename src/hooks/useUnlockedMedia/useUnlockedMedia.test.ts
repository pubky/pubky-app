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
    const { rerender } = renderHook(({ current }) => useUnlockedMedia({ post: current, preview: false }), {
      initialProps: { current: post },
    });
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
    const { result, rerender } = renderHook(({ current }) => useUnlockedMedia({ post: current, preview: false }), {
      initialProps: { current: post },
    });
    rerender({ current: { ...post, content: 'refreshed', attachments: [...post.attachments!] } });
    await act(async () => resolveRead([{ id: 'img1', contentType: 'image/png', bytes: new Uint8Array([1]), slot: 0 }]));

    expect(LocksController.fetchReplicatedAttachments).toHaveBeenCalledOnce();
    expect(result.current.media).toHaveLength(1);
  });

  it('reads the rest of an article once the card leaves the preview', async () => {
    const article: ReplicatedPost = { ...post, kind: 'long', content: JSON.stringify({ title: 'T', body: 'text' }) };
    const { rerender } = renderHook(({ preview }) => useUnlockedMedia({ post: article, preview }), {
      initialProps: { preview: true },
    });
    await waitFor(() =>
      expect(LocksController.fetchReplicatedAttachments).toHaveBeenCalledWith({ post: article, preview: true }),
    );

    rerender({ preview: false });
    await waitFor(() =>
      expect(LocksController.fetchReplicatedAttachments).toHaveBeenLastCalledWith({ post: article, preview: false }),
    );
  });

  it('does not reread a post that is not an article when the preview ends, as both read every slot', async () => {
    const { rerender } = renderHook(({ preview }) => useUnlockedMedia({ post, preview }), {
      initialProps: { preview: true },
    });
    await waitFor(() => expect(LocksController.fetchReplicatedAttachments).toHaveBeenCalledOnce());

    rerender({ preview: false });
    expect(LocksController.fetchReplicatedAttachments).toHaveBeenCalledOnce();
  });

  it('rereads a preview when the article body changes which slot is the cover', async () => {
    const article = (body: string): ReplicatedPost => ({
      ...post,
      kind: 'long',
      content: JSON.stringify({ title: 'T', body }),
    });
    const { rerender } = renderHook(({ current }) => useUnlockedMedia({ post: current, preview: true }), {
      initialProps: { current: article('text') },
    });
    await waitFor(() => expect(LocksController.fetchReplicatedAttachments).toHaveBeenCalledOnce());

    rerender({ current: article('![a](attachment:0)') });
    await waitFor(() => expect(LocksController.fetchReplicatedAttachments).toHaveBeenCalledTimes(2));
  });

  it('holds a skeleton for each slot until its bytes arrive', async () => {
    let resolveRead!: (attachments: TUnlockedAttachment[]) => void;
    vi.mocked(LocksController.fetchReplicatedAttachments).mockImplementationOnce(
      () => new Promise((resolve) => (resolveRead = resolve)),
    );
    const { result } = renderHook(() => useUnlockedMedia({ post, preview: false }));
    await waitFor(() => expect(result.current.pendingAttachments).toEqual([{ slot: 0, type: 'image/png' }]));

    await act(async () => resolveRead([{ id: 'img1', contentType: 'image/png', bytes: new Uint8Array([1]), slot: 0 }]));

    expect(result.current.pendingAttachments).toEqual([]);
    expect(result.current.media).toHaveLength(1);
  });

  it('keeps the cover and drops the skeletons when the full read fails', async () => {
    const article: ReplicatedPost = { ...post, kind: 'long', content: JSON.stringify({ title: 'T', body: 'text' }) };
    vi.mocked(LocksController.fetchReplicatedAttachments)
      .mockResolvedValueOnce([{ id: 'img1', contentType: 'image/png', bytes: new Uint8Array([1]), slot: 0 }])
      .mockRejectedValueOnce(new Error('homeserver down'));
    const { result, rerender } = renderHook(({ preview }) => useUnlockedMedia({ post: article, preview }), {
      initialProps: { preview: true },
    });
    await waitFor(() => expect(result.current.media).toHaveLength(1));

    rerender({ preview: false });
    expect(result.current.pendingAttachments).toEqual([{ slot: 0, type: 'image/png' }]);

    await waitFor(() => expect(result.current.pendingAttachments).toEqual([]));
    expect(result.current.media).toHaveLength(1);
  });

  it('drops the skeletons of a read still in flight when the post changes to one without media', async () => {
    vi.mocked(LocksController.fetchReplicatedAttachments).mockReturnValueOnce(new Promise(() => undefined));
    const { result, rerender } = renderHook(({ current }) => useUnlockedMedia({ post: current, preview: false }), {
      initialProps: { current: post },
    });
    await waitFor(() => expect(result.current.pendingAttachments).toHaveLength(1));

    rerender({ current: { ...post, attachments: [] } });

    expect(result.current.pendingAttachments).toEqual([]);
  });
});

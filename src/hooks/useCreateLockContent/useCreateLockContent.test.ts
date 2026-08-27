import { act, renderHook, waitFor } from '@testing-library/react';
import { PubkyAppPostKind } from 'pubky-app-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOCK_TEASER_MAX_CHARACTER_LENGTH,
  LOCK_TITLE_MAX_CHARACTER_LENGTH,
  POST_MAX_CHARACTER_LENGTH,
} from '@/config/posts';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { TGuardedResource } from '@/services/locks/locks.types';
import { useCreateLockContent } from './useCreateLockContent';

const mocks = vi.hoisted(() => ({
  createLockContent: vi.fn(),
  commitCreate: vi.fn(),
  post: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: { createLockContent: mocks.createLockContent, clearSession: mocks.clearSession },
}));

vi.mock('@/controllers/post/post', () => ({
  PostController: { commitCreate: mocks.commitCreate },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: 'alice' }),
}));

vi.mock('pubky-app-specs', () => ({
  PubkyAppPostKind: { Short: 0, Long: 1 },
  PubkyAppPost: class {
    constructor(
      public content: string,
      public kind: number,
      public parent: string | null,
      public embed: unknown,
      public attachments: string[] | null,
    ) {
      mocks.post(content, kind, parent, embed, attachments);
    }
    toJson() {
      return { content: this.content, attachments: this.attachments };
    }
  },
}));

const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));
const makeFile = (name: string, type: string) => new File(['xx'], name, { type });
const descriptor = (path: string): TGuardedResource => ({ path, hash: 'HASH', content_type: 'image/png', size: 2 });

const teaser = { lock_title: 'My quote', teaser_description: 'a public teaser' };

const params = (lockedAttachments: File[] = [], announcementAttachments: File[] = []) => ({
  lockedPost: { content: 'locked body', kind: PubkyAppPostKind.Short, attachments: lockedAttachments },
  announcement: { teaser, attachments: announcementAttachments, tags: ['bitcoin'] },
  lockConfig: { method: 'password' } as const,
});

describe('useCreateLockContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createLockContent.mockResolvedValue({
      lock_id: 'LOCK1',
      content_lock_path: '/pub/locks.app/LOCK1.json',
      creator: 'pubkybob',
    });
    mocks.commitCreate.mockResolvedValue('POST1');
  });

  it('uploads the locked attachments as bytes', async () => {
    const { result } = renderHook(() => useCreateLockContent(params([makeFile('a.png', 'image/png')])));

    await act(() => result.current.publish());

    const [{ attachments }] = mocks.createLockContent.mock.calls[0];
    expect(attachments).toHaveLength(1);
    expect(attachments[0].contentType).toBe('image/png');
    expect(attachments[0].bytes).toBeInstanceOf(Uint8Array);
  });

  it('builds the locked post JSON pointing at the uploaded attachment paths', async () => {
    const { result } = renderHook(() => useCreateLockContent(params([makeFile('a.png', 'image/png')])));
    await act(() => result.current.publish());

    const [{ buildPost }] = mocks.createLockContent.mock.calls[0];
    // The controller passes the guarded-bytes owner (`bob`), so the URIs point at that account — not alice.
    const postFile = buildPost([descriptor('/priv/locks.app/content/id-1')], 'pubkybob');

    expect(postFile.contentType).toBe('application/octet-stream');
    expect(decode(postFile.bytes)).toEqual({
      content: 'locked body',
      attachments: ['pubky://bob/priv/locks.app/content/id-1'],
    });
  });

  it('omits attachments from the locked post when there are none', async () => {
    const { result } = renderHook(() => useCreateLockContent(params()));
    await act(() => result.current.publish());

    const [{ buildPost }] = mocks.createLockContent.mock.calls[0];
    expect(decode(buildPost([]).bytes).attachments).toBeNull();
  });

  // The pubky.app account must never stand in for the missing owner — the two can differ (A ≠ B).
  it('refuses to build a post with attachments but no owner pubky', async () => {
    const { result } = renderHook(() => useCreateLockContent(params()));
    await act(() => result.current.publish());

    const [{ buildPost }] = mocks.createLockContent.mock.calls[0];
    expect(() => buildPost([descriptor('/priv/locks.app/content/id-1')])).toThrow();
  });

  // The announcement is posted by the pubky.app account (`alice`), but the lock URL points at the
  // Lock-Server account that owns the lock (`bob`, from `content_lock.creator`, `pubky` prefix stripped).
  it('publishes the announcement by the app account but builds the lock URL from the lock owner', async () => {
    const cover = makeFile('cover.png', 'image/png');
    const { result } = renderHook(() => useCreateLockContent(params([], [cover])));

    const postId = await act(() => result.current.publish());

    expect(mocks.commitCreate).toHaveBeenCalledWith({
      authorId: 'alice',
      content: JSON.stringify(teaser),
      attachments: [cover],
      tags: ['bitcoin'],
      lock: 'pubky://bob/pub/locks.app/LOCK1.json',
    });
    expect(postId).toEqual({ status: 'published', postId: 'POST1' });
  });

  // The lock must exist before the announcement can point at it.
  it('creates the lock before the announcement', async () => {
    const order: string[] = [];
    mocks.createLockContent.mockImplementation(async () => {
      order.push('lock');
      return { lock_id: 'LOCK1', content_lock_path: '/pub/locks.app/LOCK1.json', creator: 'pubkybob' };
    });
    mocks.commitCreate.mockImplementation(async () => {
      order.push('announcement');
      return 'POST1';
    });
    const { result } = renderHook(() => useCreateLockContent(params()));

    await act(() => result.current.publish());

    expect(order).toEqual(['lock', 'announcement']);
  });

  it('does not publish the announcement when the lock fails', async () => {
    mocks.createLockContent.mockRejectedValue(new Error('lock server down'));
    const { result } = renderHook(() => useCreateLockContent(params()));

    const outcome = await act(() => result.current.publish());

    expect(outcome).toEqual({ status: 'failed' });
    expect(mocks.commitCreate).not.toHaveBeenCalled();
  });

  // TODO:[Locks] #2181 — the lock survives this failure, unreferenced.
  it('surfaces the error and fails when the announcement fails', async () => {
    mocks.commitCreate.mockRejectedValue(new Error('homeserver down'));
    const { result } = renderHook(() => useCreateLockContent(params()));

    const outcome = await act(() => result.current.publish());

    expect(outcome).toEqual({ status: 'failed' });
    await waitFor(() => expect(result.current.error?.message).toBe('homeserver down'));
    expect(result.current.isPublishing).toBe(false);
  });

  it('drops the Locks session and returns auth-expired when the Lock Server rejects it', async () => {
    mocks.createLockContent.mockRejectedValue(
      Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Locks session rejected by the Lock Server', {
        service: ErrorService.Locks,
        operation: 'test',
      }),
    );
    const { result } = renderHook(() => useCreateLockContent(params()));

    const outcome = await act(() => result.current.publish());

    expect(outcome).toEqual({ status: 'auth-expired' });
    expect(mocks.clearSession).toHaveBeenCalledTimes(1);
  });

  describe('price guard', () => {
    const withPrice = (amountSats: string) => ({ ...params(), lockConfig: { method: 'payment', amountSats } as const });

    it('sends the applied price on to the lock', async () => {
      const { result } = renderHook(() => useCreateLockContent(withPrice('1234')));

      await act(() => result.current.publish());

      const [{ lockConfig }] = mocks.createLockContent.mock.calls[0];
      expect(lockConfig).toEqual({ method: 'payment', amountSats: '1234' });
    });

    it.each(['0', '', '12.5'])('never creates the lock for the price %j', async (amountSats) => {
      const { result } = renderHook(() => useCreateLockContent(withPrice(amountSats)));

      const outcome = await act(() => result.current.publish());

      expect(outcome).toEqual({ status: 'failed' });
      // Same reason as the announcement guard below: a rejected input must not leave an orphaned lock.
      expect(mocks.createLockContent).not.toHaveBeenCalled();
    });
  });

  describe('announcement length guard', () => {
    const withTeaser = (teaserOverride: { lock_title: string; teaser_description: string }) => ({
      ...params(),
      announcement: { teaser: teaserOverride, attachments: [], tags: [] },
    });

    it('never creates the lock when the serialized announcement exceeds the limit', async () => {
      const { result } = renderHook(() =>
        useCreateLockContent(
          withTeaser({ lock_title: 'T', teaser_description: 'x'.repeat(POST_MAX_CHARACTER_LENGTH) }),
        ),
      );

      const outcome = await act(() => result.current.publish());

      expect(outcome).toEqual({ status: 'failed' });
      // The whole point: the lock must not exist, so nothing can be orphaned.
      expect(mocks.createLockContent).not.toHaveBeenCalled();
      expect(mocks.commitCreate).not.toHaveBeenCalled();
    });

    it('blocks an escaped teaser that fits the raw per-field limits', async () => {
      const { result } = renderHook(() =>
        useCreateLockContent(
          withTeaser({ lock_title: '', teaser_description: '"'.repeat(LOCK_TEASER_MAX_CHARACTER_LENGTH) }),
        ),
      );

      const outcome = await act(() => result.current.publish());

      expect(outcome).toEqual({ status: 'failed' });
      expect(mocks.createLockContent).not.toHaveBeenCalled();
    });

    it('publishes when both fields are filled to their maxLengths', async () => {
      const { result } = renderHook(() =>
        useCreateLockContent(
          withTeaser({
            lock_title: 'a'.repeat(LOCK_TITLE_MAX_CHARACTER_LENGTH),
            teaser_description: 'b'.repeat(LOCK_TEASER_MAX_CHARACTER_LENGTH),
          }),
        ),
      );

      const outcome = await act(() => result.current.publish());

      expect(outcome).toEqual({ status: 'published', postId: 'POST1' });
      const [{ content }] = mocks.commitCreate.mock.calls[0];
      expect(content.length).toBe(POST_MAX_CHARACTER_LENGTH);
    });

    // The guard only holds while the string it measures is the string that ships.
    it('publishes exactly the envelope the guard measured', async () => {
      const extra = { ...teaser, cover_image: 'x'.repeat(POST_MAX_CHARACTER_LENGTH) };
      const { result } = renderHook(() => useCreateLockContent(withTeaser(extra)));

      await act(() => result.current.publish());

      const [{ content }] = mocks.commitCreate.mock.calls[0];
      expect(content).toBe(JSON.stringify(teaser));
    });
  });

  it('keeps the Locks session when the homeserver session expires on the announcement', async () => {
    mocks.commitCreate.mockRejectedValue(
      Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Session expired', {
        service: ErrorService.Homeserver,
        operation: 'test',
      }),
    );
    const { result } = renderHook(() => useCreateLockContent(params()));

    const outcome = await act(() => result.current.publish());

    expect(outcome).toEqual({ status: 'failed' });
    expect(mocks.clearSession).not.toHaveBeenCalled();
  });

  it('keeps the session and does not flag re-auth on a non-auth failure', async () => {
    mocks.createLockContent.mockRejectedValue(new Error('lock server down'));
    const { result } = renderHook(() => useCreateLockContent(params()));

    const outcome = await act(() => result.current.publish());

    expect(outcome).toEqual({ status: 'failed' });
    expect(mocks.clearSession).not.toHaveBeenCalled();
  });
});

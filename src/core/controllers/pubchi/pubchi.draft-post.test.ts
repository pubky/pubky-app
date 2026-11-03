import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiApplication } from '@/application/pubchi/pubchi';
import { PostController } from '@/controllers/post/post';
import * as pubchiDatabase from '@/database/pubchi/pubchi';
import { useDraftPostApplication } from '@/hooks/useDraftPostApplication/useDraftPostApplication';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import * as flags from '@/libs/pubchi/flags';
import { useAuthStore } from '@/stores/auth/auth.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { PubchiController } from './pubchi';

const owner = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const postId = '0032W6CBGDBP0';
const prepared = {
  applicationId: 'a'.repeat(64),
  binding: { owner },
  draft: {
    content: 'Pubky keeps public social state on your homeserver.',
    kind: 'short' as const,
    tags: ['pubky-app'],
    rationale: 'Matches the public profile evidence.',
    evidence: [`pubky://${owner}/pub/pubky.app/profile.json`],
  },
  existingCompositePostId: undefined as string | undefined,
  existingPostUri: undefined as string | undefined,
};

describe('PubchiController draft post application', () => {
  beforeEach(() => {
    vi.spyOn(useAuthStore, 'getState').mockReturnValue(
      asOpaque<ReturnType<typeof useAuthStore.getState>>({
        selectCurrentUserPubky: () => owner,
        selectSession: () => ({ info: { capabilities: ['/pub/pubky.app/:rw', '/priv/app.pubchi/v1/:rw'] } }),
      }),
    );
    vi.spyOn(PubchiApplication, 'prepareDraftPostApplication').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiApplication.prepareDraftPostApplication>>>(prepared),
    );
    vi.spyOn(PubchiApplication, 'finalizeDraftPostApplication').mockResolvedValue();
    vi.spyOn(PubchiApplication, 'recordDraftPostApplyOutcome').mockResolvedValue();
    vi.spyOn(PubchiApplication, 'recordDraftPostRevertOperation').mockResolvedValue();
    vi.spyOn(PubchiApplication, 'markDraftPostReconciliationPending').mockResolvedValue();
    vi.spyOn(PubchiController, 'getDraftPostStatus').mockResolvedValue('failed');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    PubchiApplication.resetDraftPostOperationsForTests();
  });

  it('C finalizes a published post as applied under U', async () => {
    const create = vi.spyOn(PostController, 'commitCreate').mockResolvedValue(`${owner}:${postId}`);
    const remove = vi.spyOn(PostController, 'commitDelete');

    await expect(PubchiController.applyDraftPost('record')).resolves.toBe('applied');
    expect(create).toHaveBeenCalledWith({
      authorId: owner,
      content: prepared.draft.content,
      isArticle: false,
      tags: ['pubky-app'],
    });
    expect(remove).not.toHaveBeenCalled();
    expect(PubchiApplication.finalizeDraftPostApplication).toHaveBeenCalledWith(
      'record',
      prepared.applicationId,
      'applied',
      `pubky://${owner}/pub/pubky.app/posts/${postId}`,
      `${owner}:${postId}`,
    );
  });

  it('C wraps kind=long as App article JSON', async () => {
    vi.spyOn(PubchiApplication, 'prepareDraftPostApplication').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiApplication.prepareDraftPostApplication>>>({
        ...prepared,
        draft: { ...prepared.draft, kind: 'long', content: 'Headline\nBody paragraph' },
      }),
    );
    const create = vi.spyOn(PostController, 'commitCreate').mockResolvedValue(`${owner}:${postId}`);

    await expect(PubchiController.applyDraftPost('record')).resolves.toBe('applied');
    expect(create).toHaveBeenCalledWith({
      authorId: owner,
      content: JSON.stringify({ title: 'Headline', body: 'Body paragraph' }),
      isArticle: true,
      tags: ['pubky-app'],
    });
  });

  it('C refuses a second in-flight apply', async () => {
    let resolveCreate!: (value: string) => void;
    const create = vi.spyOn(PostController, 'commitCreate').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const first = PubchiController.applyDraftPost('record');
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());

    await expect(PubchiController.applyDraftPost('record')).rejects.toMatchObject({
      message: 'Draft post operation is already in progress',
    });
    expect(create).toHaveBeenCalledTimes(1);
    resolveCreate(`${owner}:${postId}`);
    await expect(first).resolves.toBe('applied');
  });

  it('C retries from a stored composite without commitCreate', async () => {
    vi.spyOn(PubchiApplication, 'prepareDraftPostApplication').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiApplication.prepareDraftPostApplication>>>({
        ...prepared,
        existingCompositePostId: `${owner}:${postId}`,
        existingPostUri: `pubky://${owner}/pub/pubky.app/posts/${postId}`,
      }),
    );
    const create = vi.spyOn(PostController, 'commitCreate');

    await expect(PubchiController.applyDraftPost('record')).resolves.toBe('applied');
    expect(create).not.toHaveBeenCalled();
    expect(PubchiApplication.recordDraftPostApplyOutcome).toHaveBeenCalledWith(
      'record',
      `${owner}:${postId}`,
      `pubky://${owner}/pub/pubky.app/posts/${postId}`,
    );
  });

  it('keeps an unknown publication outcome pending without adopting or deleting another post', async () => {
    const create = vi.spyOn(PostController, 'commitCreate').mockRejectedValue(new Error('response lost'));
    const remove = vi.spyOn(PostController, 'commitDelete');
    await expect(PubchiController.applyDraftPost('record')).resolves.toBe('reconciliation-pending');
    expect(create).toHaveBeenCalledOnce();
    expect(PubchiApplication.recordDraftPostApplyOutcome).not.toHaveBeenCalled();
    expect(PubchiApplication.finalizeDraftPostApplication).not.toHaveBeenCalled();
    expect(PubchiApplication.markDraftPostReconciliationPending).toHaveBeenCalledWith('record');
    expect(remove).not.toHaveBeenCalled();
  });

  it('C hook coalesces a second approve so commitCreate runs once', async () => {
    let resolveCreate!: (value: string) => void;
    const create = vi.spyOn(PostController, 'commitCreate').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const { result } = renderHook(() => useDraftPostApplication('record'));
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = result.current.approve();
      second = result.current.approve();
    });
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    resolveCreate(`${owner}:${postId}`);
    await act(async () => {
      await first;
      await second;
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('applied');
  });

  it('exposes pending hook status when post publication has no returned identity', async () => {
    vi.spyOn(PostController, 'commitCreate').mockRejectedValue(new Error('post response lost'));
    const { result } = renderHook(() => useDraftPostApplication('record'));
    await act(async () => result.current.approve());
    expect(result.current.status).toBe('reconciliation-pending');
    expect(PubchiApplication.finalizeDraftPostApplication).not.toHaveBeenCalled();
  });

  it('C marks a completed apply reconciliation-pending when receipt finalization fails', async () => {
    vi.spyOn(PostController, 'commitCreate').mockResolvedValue(`${owner}:${postId}`);
    const finalize = vi
      .spyOn(PubchiApplication, 'finalizeDraftPostApplication')
      .mockRejectedValue(new Error('receipt unavailable'));
    const pending = vi.spyOn(PubchiApplication, 'markDraftPostReconciliationPending').mockResolvedValue();

    await expect(PubchiController.applyDraftPost('record')).rejects.toMatchObject({ category: 'network' });

    expect(PubchiApplication.recordDraftPostApplyOutcome).toHaveBeenCalledWith(
      'record',
      `${owner}:${postId}`,
      `pubky://${owner}/pub/pubky.app/posts/${postId}`,
    );
    expect(finalize).toHaveBeenCalledWith(
      'record',
      prepared.applicationId,
      'applied',
      `pubky://${owner}/pub/pubky.app/posts/${postId}`,
      `${owner}:${postId}`,
    );
    expect(finalize).not.toHaveBeenCalledWith('record', prepared.applicationId, 'failed');
    expect(pending).toHaveBeenCalledWith('record');
  });

  it('C moves directly to reconciliation-pending when apply outcome persistence throws', async () => {
    vi.spyOn(PostController, 'commitCreate').mockResolvedValue(`${owner}:${postId}`);
    vi.spyOn(PubchiApplication, 'recordDraftPostApplyOutcome').mockRejectedValue(new Error('outcome unavailable'));
    const pending = vi.spyOn(PubchiApplication, 'markDraftPostReconciliationPending').mockResolvedValue();
    const { result } = renderHook(() => useDraftPostApplication('record'));

    await act(async () => result.current.approve());

    expect(pending).toHaveBeenCalledWith('record');
    expect(result.current.status).toBe('reconciliation-pending');
  });

  it('reject never calls commitCreate', async () => {
    vi.spyOn(PubchiApplication, 'prepareDraftPostReject').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiApplication.prepareDraftPostReject>>>({
        applicationId: prepared.applicationId,
        binding: prepared.binding,
      }),
    );
    const create = vi.spyOn(PostController, 'commitCreate');
    const { result } = renderHook(() => useDraftPostApplication('record'));

    await act(async () => result.current.reject());

    expect(create).not.toHaveBeenCalled();
    expect(result.current.status).toBe('rejected');
  });

  it('does not hydrate drafts or open Dexie while Pubchi is disabled', () => {
    vi.spyOn(flags, 'isPubchiEnabled').mockReturnValue(false);
    const getDatabase = vi.spyOn(pubchiDatabase, 'getPubchiDatabase');
    const getStatus = vi.spyOn(PubchiController, 'getDraftPostStatus');

    renderHook(() => useDraftPostApplication('record'));

    expect(getStatus).not.toHaveBeenCalled();
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it('reconciles pending applications again when the card becomes visible', async () => {
    vi.spyOn(flags, 'isPubchiEnabled').mockReturnValue(true);
    vi.spyOn(PubchiController, 'getDraftPostStatus').mockResolvedValue('reconciliation-pending');
    const reconcile = vi.spyOn(PubchiController, 'reconcileDraftPost').mockResolvedValue('applied');
    const { rerender } = renderHook(({ visible }) => useDraftPostApplication('record', visible), {
      initialProps: { visible: true },
    });

    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
    rerender({ visible: false });
    rerender({ visible: true });
    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(2));
  });

  it('D treats an already-deleted post as reverted', async () => {
    vi.spyOn(PubchiApplication, 'prepareDraftPostRevert').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiApplication.prepareDraftPostRevert>>>({
        applicationId: prepared.applicationId,
        binding: prepared.binding,
        compositePostId: `${owner}:${postId}`,
      }),
    );
    const remove = vi.spyOn(PostController, 'commitDelete').mockRejectedValue(
      Err.client(ClientErrorCode.NOT_FOUND, 'Post not found', {
        service: ErrorService.Local,
        operation: 'commitDelete',
        context: { statusCode: HttpStatusCode.NOT_FOUND },
      }),
    );

    await expect(PubchiController.revertDraftPost('record')).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(PubchiApplication.finalizeDraftPostApplication).toHaveBeenCalledWith(
      'record',
      prepared.applicationId,
      'reverted',
    );
    expect(PubchiApplication.finalizeDraftPostApplication).not.toHaveBeenCalledWith(
      'record',
      prepared.applicationId,
      'failed',
    );
  });

  it('D persists reconciliation-pending when delete fails for a reason other than missing', async () => {
    vi.spyOn(PubchiApplication, 'prepareDraftPostRevert').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiApplication.prepareDraftPostRevert>>>({
        applicationId: prepared.applicationId,
        binding: prepared.binding,
        compositePostId: `${owner}:${postId}`,
      }),
    );
    vi.spyOn(PostController, 'commitDelete').mockRejectedValue(new Error('delete failed'));
    const pending = vi.spyOn(PubchiApplication, 'markDraftPostReconciliationPending').mockResolvedValue();

    await expect(PubchiController.revertDraftPost('record')).rejects.toThrow('delete failed');
    expect(PubchiApplication.finalizeDraftPostApplication).not.toHaveBeenCalled();
    expect(pending).toHaveBeenCalledWith('record');
  });

  it('D persists reconciliation-pending and returns a typed retryable error when receipt finalization fails', async () => {
    vi.spyOn(PubchiApplication, 'prepareDraftPostRevert').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiApplication.prepareDraftPostRevert>>>({
        applicationId: prepared.applicationId,
        binding: prepared.binding,
        compositePostId: `${owner}:${postId}`,
      }),
    );
    vi.spyOn(PostController, 'commitDelete').mockResolvedValue();
    vi.spyOn(PubchiApplication, 'finalizeDraftPostApplication').mockRejectedValue(new Error('receipt unavailable'));
    const pending = vi.spyOn(PubchiApplication, 'markDraftPostReconciliationPending').mockResolvedValue();

    await expect(PubchiController.revertDraftPost('record')).rejects.toMatchObject({ category: 'network' });
    expect(pending).toHaveBeenCalledWith('record');
  });
});

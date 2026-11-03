import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiApplication } from '@/application/pubchi/pubchi';
import { TagController } from '@/controllers/tag/tag';
import * as pubchiDatabase from '@/database/pubchi/pubchi';
import { useTagSuggestionApplication } from '@/hooks/useTagSuggestionApplication/useTagSuggestionApplication';
import * as flags from '@/libs/pubchi/flags';
import { useAuthStore } from '@/stores/auth/auth.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { PubchiController } from './pubchi';

const owner = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const tagDocumentSha256 = 'e'.repeat(64);
const prepared = {
  tagDocumentSha256,
  applicationId: 'a'.repeat(64),
  binding: {
    owner,
    target: { kind: 'user' as const, uri: `pubky://${owner}/pub/pubky.app/profile.json` },
  },
  suggestion: { label: 'builder' },
};

describe('PubchiController tag suggestion application', () => {
  beforeEach(() => {
    vi.spyOn(useAuthStore, 'getState').mockReturnValue(
      asOpaque<ReturnType<typeof useAuthStore.getState>>({
        selectCurrentUserPubky: () => owner,
        selectSession: () => ({ info: { capabilities: ['/pub/pubky.app/:rw', '/priv/app.pubchi/v1/:rw'] } }),
      }),
    );
    vi.spyOn(PubchiApplication, 'prepareTagSuggestionApplication').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiApplication.prepareTagSuggestionApplication>>>(prepared),
    );
    vi.spyOn(PubchiApplication, 'finalizeTagSuggestionApplication').mockResolvedValue();
    vi.spyOn(PubchiApplication, 'recordTagSuggestionApplyOutcome').mockResolvedValue();
    vi.spyOn(PubchiApplication, 'recordTagSuggestionRevertOperation').mockResolvedValue();
    vi.spyOn(PubchiController, 'getTagSuggestionStatuses').mockResolvedValue({ 0: 'failed' });
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([
    [true, 'superseded'],
    [false, 'applied'],
  ] as const)('C finalizes %s existing tag as %s', async (alreadyExisted, status) => {
    const create = vi.spyOn(TagController, 'commitCreatePreservingExisting').mockResolvedValue({
      alreadyExisted,
      tagDocumentSha256,
      tagUrl: `pubky://${owner}/pub/pubky.app/tags/builder`,
    });
    const remove = vi.spyOn(TagController, 'commitDeleteIfUnchanged');

    await expect(PubchiController.applyTagSuggestion('record', 0)).resolves.toBe(status);
    expect(create).toHaveBeenCalledWith({ taggedKind: 'user', taggedId: owner, label: 'builder', taggerId: owner });
    expect(PubchiApplication.recordTagSuggestionApplyOutcome).toHaveBeenCalledWith(
      'record',
      0,
      alreadyExisted,
      tagDocumentSha256,
    );
    expect(remove).not.toHaveBeenCalled();
    expect(PubchiApplication.finalizeTagSuggestionApplication).toHaveBeenCalledWith(
      'record',
      0,
      prepared.applicationId,
      status,
      expect.any(String),
      alreadyExisted,
    );
  });

  it('C records failure and exposes failed hook status when creation throws', async () => {
    vi.spyOn(TagController, 'commitCreatePreservingExisting').mockRejectedValue(new Error('tag write failed'));
    const { result } = renderHook(() => useTagSuggestionApplication('record'));

    await act(async () => result.current.approve(0));

    expect(result.current.statuses[0]).toBe('failed');
    expect(PubchiApplication.finalizeTagSuggestionApplication).toHaveBeenCalledWith(
      'record',
      0,
      prepared.applicationId,
      'failed',
    );
  });

  it.each([
    [false, 'applied'],
    [true, 'superseded'],
  ] as const)(
    'C marks a completed %s apply reconciliation-pending when receipt finalization fails',
    async (alreadyExisted, status) => {
      vi.spyOn(TagController, 'commitCreatePreservingExisting').mockResolvedValue({
        alreadyExisted,
        tagDocumentSha256,
        tagUrl: `pubky://${owner}/pub/pubky.app/tags/builder`,
      });
      const finalize = vi
        .spyOn(PubchiApplication, 'finalizeTagSuggestionApplication')
        .mockRejectedValue(new Error('receipt unavailable'));
      const pending = vi.spyOn(PubchiApplication, 'markTagSuggestionReconciliationPending').mockResolvedValue();

      await expect(PubchiController.applyTagSuggestion('record', 0)).rejects.toMatchObject({ category: 'network' });

      expect(PubchiApplication.recordTagSuggestionApplyOutcome).toHaveBeenCalledWith(
        'record',
        0,
        alreadyExisted,
        tagDocumentSha256,
      );
      expect(finalize).toHaveBeenCalledWith(
        'record',
        0,
        prepared.applicationId,
        status,
        expect.any(String),
        alreadyExisted,
      );
      expect(finalize).not.toHaveBeenCalledWith('record', 0, prepared.applicationId, 'failed');
      expect(pending).toHaveBeenCalledWith('record', 0);
    },
  );

  it('C moves directly to reconciliation-pending when apply outcome persistence throws', async () => {
    vi.spyOn(TagController, 'commitCreatePreservingExisting').mockResolvedValue({
      alreadyExisted: false,
      tagDocumentSha256,
      tagUrl: `pubky://${owner}/pub/pubky.app/tags/builder`,
    });
    vi.spyOn(PubchiApplication, 'recordTagSuggestionApplyOutcome').mockRejectedValue(new Error('outcome unavailable'));
    const pending = vi.spyOn(PubchiApplication, 'markTagSuggestionReconciliationPending').mockResolvedValue();
    const { result } = renderHook(() => useTagSuggestionApplication('record'));

    await act(async () => result.current.approve(0));

    expect(pending).toHaveBeenCalledWith('record', 0);
    expect(result.current.statuses[0]).toBe('reconciliation-pending');
  });

  it('does not hydrate tag suggestions or open Dexie while Pubchi is disabled', () => {
    vi.spyOn(flags, 'isPubchiEnabled').mockReturnValue(false);
    const getDatabase = vi.spyOn(pubchiDatabase, 'getPubchiDatabase');
    const getStatuses = vi.spyOn(PubchiController, 'getTagSuggestionStatuses');

    renderHook(() => useTagSuggestionApplication('record'));

    expect(getStatuses).not.toHaveBeenCalled();
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it('reconciles pending applications again when the card becomes visible', async () => {
    vi.spyOn(flags, 'isPubchiEnabled').mockReturnValue(true);
    vi.spyOn(PubchiController, 'getTagSuggestionStatuses').mockResolvedValue({ 0: 'reconciliation-pending' });
    const reconcile = vi.spyOn(PubchiController, 'reconcileTagSuggestion').mockResolvedValue('applied');
    const { rerender } = renderHook(({ visible }) => useTagSuggestionApplication('record', visible), {
      initialProps: { visible: true },
    });

    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
    rerender({ visible: false });
    rerender({ visible: true });
    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(2));
  });

  it('D materializes before deleting and leaves the receipt untouched when delete fails', async () => {
    vi.spyOn(PubchiApplication, 'prepareTagSuggestionRevert').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiApplication.prepareTagSuggestionRevert>>>(prepared),
    );
    const materialize = vi.spyOn(TagController, 'materializeForDelete').mockResolvedValue();
    const remove = vi.spyOn(TagController, 'commitDeleteIfUnchanged').mockRejectedValue(new Error('delete failed'));

    await expect(PubchiController.revertTagSuggestion('record', 0)).rejects.toThrow('delete failed');
    expect(materialize).toHaveBeenCalledWith({
      taggedKind: 'user',
      taggedId: owner,
      label: 'builder',
      taggerId: owner,
    });
    expect(PubchiApplication.finalizeTagSuggestionApplication).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(
      { taggedKind: 'user', taggedId: owner, label: 'builder', taggerId: owner },
      tagDocumentSha256,
    );
  });

  it('D persists reconciliation-pending and returns a typed retryable error when receipt finalization fails', async () => {
    vi.spyOn(PubchiApplication, 'prepareTagSuggestionRevert').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiApplication.prepareTagSuggestionRevert>>>(prepared),
    );
    vi.spyOn(TagController, 'materializeForDelete').mockResolvedValue();
    vi.spyOn(TagController, 'commitDeleteIfUnchanged').mockResolvedValue();
    vi.spyOn(PubchiApplication, 'finalizeTagSuggestionApplication').mockRejectedValue(new Error('receipt unavailable'));
    const pending = vi.spyOn(PubchiApplication, 'markTagSuggestionReconciliationPending').mockResolvedValue();

    await expect(PubchiController.revertTagSuggestion('record', 0)).rejects.toMatchObject({ category: 'network' });
    expect(pending).toHaveBeenCalledWith('record', 0);
  });
});

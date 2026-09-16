import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import { LocalTagCacheService } from '@/services/local/tag/tag-cache';
import { LocalUserTagService } from '@/services/local/tag/user/tag.user';
import { TagApplication } from './tag';
import { TagKind, type TCreateTagInput } from './tag.types';

vi.mock('@/services/homeserver/homeserver', () => ({ HomeserverService: { request: vi.fn() } }));
vi.mock('@/services/local/tag/post/tag.post', () => ({ LocalPostTagService: { create: vi.fn(), delete: vi.fn() } }));
vi.mock('@/services/local/tag/user/tag.user', () => ({ LocalUserTagService: { create: vi.fn(), delete: vi.fn() } }));
vi.mock('@/services/local/tag/tag-cache', () => ({
  LocalTagCacheService: { completeMutation: vi.fn(), getViewerMutations: vi.fn() },
}));

describe.each([TagKind.POST, TagKind.USER])('TagApplication (%s)', (taggedKind) => {
  const local = taggedKind === TagKind.POST ? LocalPostTagService : LocalUserTagService;
  const data: TCreateTagInput = {
    taggedKind,
    taggedId: 'author:post',
    taggerId: 'viewer',
    label: 'bitcoin',
    tagUrl: 'pubky://viewer/pub/pubky.app/tags/tag',
    tagJson: { label: 'bitcoin' },
  };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(local.create).mockResolvedValue(true);
    vi.mocked(local.delete).mockResolvedValue(true);
    vi.mocked(HomeserverService.request).mockResolvedValue(undefined);
    vi.mocked(LocalTagCacheService.completeMutation).mockResolvedValue(undefined);
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each(['create', 'delete'] as const)('can %s on an origin without randomUUID', async (action) => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    if (action === 'create') await TagApplication.commitCreate({ tagList: [data] });
    else await TagApplication.commitDelete(data);
    expect(local[action]).toHaveBeenCalledWith(expect.objectContaining({ mutationId: expect.any(String) }));
    expect(HomeserverService.request).toHaveBeenCalledOnce();
  });

  it.each(['create', 'delete'] as const)('persists %s before syncing, then settles that operation', async (action) => {
    const pending = Promise.withResolvers<void>();
    vi.mocked(local[action]).mockImplementation(async () => {
      await pending.promise;
      return true;
    });
    const result =
      action === 'create' ? TagApplication.commitCreate({ tagList: [data] }) : TagApplication.commitDelete(data);
    expect(HomeserverService.request).not.toHaveBeenCalled();
    pending.resolve();
    await result;
    const operation = vi.mocked(local[action]).mock.calls[0][0];
    expect(operation.mutationId).toEqual(expect.any(String));
    expect(HomeserverService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: action === 'create' ? HttpMethod.PUT : HttpMethod.DELETE,
        url: data.tagUrl,
      }),
    );
    expect(LocalTagCacheService.completeMutation).toHaveBeenCalledWith(
      { kind: taggedKind, id: data.taggedId },
      { mutationId: operation.mutationId, isCurrent: undefined },
    );
  });

  it.each(['create', 'delete'] as const)('conditionally compensates only the failed %s operation', async (action) => {
    const failure = new Error('homeserver offline');
    vi.mocked(HomeserverService.request).mockRejectedValue(failure);
    const result =
      action === 'create' ? TagApplication.commitCreate({ tagList: [data] }) : TagApplication.commitDelete(data);
    await expect(result).rejects.toBe(failure);
    const original = vi.mocked(local[action]).mock.calls[0][0];
    const undo = vi.mocked(local[action === 'create' ? 'delete' : 'create']).mock.calls[0][0];
    expect(undo).toMatchObject({ expectedMutationId: original.mutationId, synced: true });
    expect(undo.mutationId).not.toBe(original.mutationId);
    expect(LocalTagCacheService.completeMutation).not.toHaveBeenCalled();
  });

  it('does not compensate in a replaced session, even if the account is unchanged', async () => {
    let current = true;
    vi.mocked(HomeserverService.request).mockImplementation(async () => {
      current = false;
      throw new Error('offline');
    });
    await expect(TagApplication.commitCreate({ tagList: [data], isCurrent: () => current })).rejects.toThrow('offline');
    expect(local.delete).not.toHaveBeenCalled();
  });

  it('accepts DELETE 404 and settles the deletion without restoring a ghost tag', async () => {
    vi.mocked(HomeserverService.request).mockRejectedValue(
      Err.client(ClientErrorCode.NOT_FOUND, 'Absent', {
        service: ErrorService.Homeserver,
        operation: 'delete',
      }),
    );
    await TagApplication.commitDelete(data);
    expect(local.create).not.toHaveBeenCalled();
    expect(LocalTagCacheService.completeMutation).toHaveBeenCalledOnce();
  });

  it('does not send an idempotent local delete', async () => {
    vi.mocked(local.delete).mockResolvedValue(false);
    await TagApplication.commitDelete(data);
    expect(HomeserverService.request).not.toHaveBeenCalled();
  });

  it('does not undo a preexisting tag when its redundant PUT fails', async () => {
    vi.mocked(local.create).mockResolvedValue(false);
    vi.mocked(HomeserverService.request).mockRejectedValue(new Error('offline'));
    await expect(TagApplication.commitCreate({ tagList: [data] })).rejects.toThrow('offline');
    expect(local.delete).not.toHaveBeenCalled();
  });

  it('stops before later tags after a failed entry', async () => {
    vi.mocked(HomeserverService.request).mockRejectedValue(new Error('offline'));
    await expect(TagApplication.commitCreate({ tagList: [data, { ...data, label: 'later' }] })).rejects.toThrow(
      'offline',
    );
    expect(local.create).toHaveBeenCalledOnce();
  });

  it('does not compensate an accepted homeserver write when settling its metadata fails', async () => {
    vi.mocked(LocalTagCacheService.completeMutation).mockRejectedValue(new Error('database unavailable'));
    await expect(TagApplication.commitCreate({ tagList: [data] })).rejects.toThrow('database unavailable');
    expect(local.delete).not.toHaveBeenCalled();
  });

  it('does not sync after a failed local transaction', async () => {
    vi.mocked(local.create).mockRejectedValue(new Error('database unavailable'));
    await expect(TagApplication.commitCreate({ tagList: [data] })).rejects.toThrow('database unavailable');
    expect(HomeserverService.request).not.toHaveBeenCalled();
  });
});

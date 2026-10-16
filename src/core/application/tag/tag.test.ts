import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthErrorCode, ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import { LocalTagCacheService } from '@/services/local/tag/tag-cache';
import { LocalUserTagService } from '@/services/local/tag/user/tag.user';
import { NexusPostService } from '@/services/nexus/post/post';
import { NexusUserService } from '@/services/nexus/user/user';
import { TagApplication } from './tag';
import { TagKind, type TCreateTagInput } from './tag.types';

vi.mock('@/services/homeserver/homeserver', () => ({ HomeserverService: { request: vi.fn() } }));
vi.mock('@/services/local/tag/post/tag.post', () => ({ LocalPostTagService: { create: vi.fn(), delete: vi.fn() } }));
vi.mock('@/services/local/tag/user/tag.user', () => ({ LocalUserTagService: { create: vi.fn(), delete: vi.fn() } }));
vi.mock('@/services/local/tag/tag-cache', () => ({
  LocalTagCacheService: { completeMutation: vi.fn(), getViewerMutations: vi.fn(), getViewerTagUri: vi.fn() },
}));
vi.mock('@/services/nexus/post/post', () => ({ NexusPostService: { getPostTaggers: vi.fn() } }));
vi.mock('@/services/nexus/user/user', () => ({ NexusUserService: { taggers: vi.fn() } }));

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
    vi.mocked(LocalTagCacheService.getViewerTagUri).mockResolvedValue(data.tagUrl);
  });

  const fetchTaggers = () =>
    taggedKind === TagKind.POST ? vi.mocked(NexusPostService.getPostTaggers) : vi.mocked(NexusUserService.taggers);
  const deleteRequest = () =>
    vi.mocked(HomeserverService.request).mock.calls.find(([request]) => request.method === HttpMethod.DELETE)?.[0];

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

  it.each(['create', 'delete'] as const)(
    'compensates a rejected %s after the 401 handling ended the session',
    async (action) => {
      // The session failure listener nulls the session before the rejection reaches the catch. The
      // undo is bound to its operation id instead; the local services' ownership tests cover how
      // that keeps another account's database untouched.
      let current = true;
      const isCurrent = () => current;
      const rejected = Err.auth(AuthErrorCode.UNAUTHORIZED, 'Unauthorized', {
        service: ErrorService.Homeserver,
        operation: 'request',
      });
      vi.mocked(HomeserverService.request).mockImplementation(async () => {
        current = false;
        throw rejected;
      });
      const result =
        action === 'create'
          ? TagApplication.commitCreate({ tagList: [data], isCurrent })
          : TagApplication.commitDelete({ ...data, isCurrent });
      await expect(result).rejects.toBe(rejected);
      const original = vi.mocked(local[action]).mock.calls[0][0];
      const undo = vi.mocked(local[action === 'create' ? 'delete' : 'create']).mock.calls[0][0];
      expect(undo).toMatchObject({ expectedMutationId: original.mutationId, synced: true });
      expect(undo.isCurrent).toBeUndefined();
      expect(LocalTagCacheService.completeMutation).not.toHaveBeenCalled();
    },
  );

  it.each(['create', 'delete'] as const)(
    'undoes an optimistic %s when the session ends before its request starts',
    async (action) => {
      let current = true;
      vi.mocked(local[action]).mockImplementation(async () => {
        current = false;
        return true;
      });
      if (action === 'create') await TagApplication.commitCreate({ tagList: [data], isCurrent: () => current });
      else await TagApplication.commitDelete({ ...data, isCurrent: () => current });
      expect(HomeserverService.request).not.toHaveBeenCalled();
      const original = vi.mocked(local[action]).mock.calls[0][0];
      const undo = vi.mocked(local[action === 'create' ? 'delete' : 'create']).mock.calls[0][0];
      expect(undo).toMatchObject({ expectedMutationId: original.mutationId, synced: true });
      expect(undo.isCurrent).toBeUndefined();
      expect(LocalTagCacheService.completeMutation).not.toHaveBeenCalled();
    },
  );

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

  it('records the URL a create writes, so it can be deleted before Nexus reports it', async () => {
    await TagApplication.commitCreate({ tagList: [data] });
    expect(local.create).toHaveBeenCalledWith(expect.objectContaining({ tagUri: data.tagUrl }));
  });

  it('deletes the stored address, even one written by another app, without asking Nexus', async () => {
    const tagUri = 'pubky://viewer/pub/mapky/tags/MAPKY01';
    vi.mocked(LocalTagCacheService.getViewerTagUri).mockResolvedValue(tagUri);
    await TagApplication.commitDelete(data);
    expect(LocalTagCacheService.getViewerTagUri).toHaveBeenCalledWith(
      { kind: taggedKind, id: data.taggedId },
      data.label,
      data.taggerId,
    );
    expect(deleteRequest()?.url).toBe(tagUri);
    expect(fetchTaggers()).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['owned by another user', 'pubky://other/pub/pubky.app/tags/TAG01'],
  ])('asks Nexus for the viewer tag_uri when the local address is %s', async (_case, localUri) => {
    const tagUri = 'pubky://viewer/pub/social/v1/tags/SOCIAL01';
    vi.mocked(LocalTagCacheService.getViewerTagUri).mockResolvedValue(localUri);
    fetchTaggers().mockResolvedValue({ users: ['viewer'], relationship: true, tag_uri: tagUri });
    await TagApplication.commitDelete(data);
    expect(fetchTaggers()).toHaveBeenCalledWith(
      taggedKind === TagKind.POST
        ? { compositeId: data.taggedId, label: data.label, limit: 1, viewerId: data.taggerId, notFoundRetries: 0 }
        : { user_id: data.taggedId, label: data.label, limit: 1, viewer_id: data.taggerId, notFoundRetries: 0 },
    );
    expect(deleteRequest()?.url).toBe(tagUri);
    expect(LocalTagCacheService.completeMutation).toHaveBeenCalledOnce();
  });

  it('keeps the deletion when Nexus reports the viewer no longer tags the label', async () => {
    vi.mocked(LocalTagCacheService.getViewerTagUri).mockResolvedValue(undefined);
    fetchTaggers().mockResolvedValue({ users: [], relationship: false, tag_uri: null });
    await TagApplication.commitDelete(data);
    expect(HomeserverService.request).not.toHaveBeenCalled();
    expect(local.create).not.toHaveBeenCalled();
    expect(LocalTagCacheService.completeMutation).toHaveBeenCalledOnce();
  });

  it.each([
    ['no address', null],
    ['an address outside the viewer tags', 'pubky://viewer/pub/pubky.app/posts/POST01'],
  ])(
    'restores the tag and never rebuilds the URL when the viewer tags it but Nexus reports %s',
    async (_case, tagUri) => {
      vi.mocked(LocalTagCacheService.getViewerTagUri).mockResolvedValue(undefined);
      fetchTaggers().mockResolvedValue({ users: ['viewer'], relationship: true, tag_uri: tagUri });
      await expect(TagApplication.commitDelete(data)).rejects.toMatchObject({
        code: ServerErrorCode.INVALID_RESPONSE,
      });
      expect(HomeserverService.request).not.toHaveBeenCalled();
      const original = vi.mocked(local.delete).mock.calls[0][0];
      expect(local.create).toHaveBeenCalledWith(
        expect.objectContaining({ expectedMutationId: original.mutationId, synced: true, tagUri: undefined }),
      );
      expect(LocalTagCacheService.completeMutation).not.toHaveBeenCalled();
    },
  );

  it('undoes the optimistic delete without a request for a session replaced while Nexus was asked', async () => {
    let current = true;
    const tagUri = 'pubky://viewer/pub/pubky.app/tags/TAG01';
    vi.mocked(LocalTagCacheService.getViewerTagUri).mockResolvedValue(undefined);
    fetchTaggers().mockImplementation(async () => {
      current = false;
      return { users: ['viewer'], relationship: true, tag_uri: tagUri };
    });
    await TagApplication.commitDelete({ ...data, isCurrent: () => current });
    expect(HomeserverService.request).not.toHaveBeenCalled();
    const original = vi.mocked(local.delete).mock.calls[0][0];
    expect(local.create).toHaveBeenCalledWith(
      expect.objectContaining({ expectedMutationId: original.mutationId, synced: true, tagUri }),
    );
    expect(LocalTagCacheService.completeMutation).not.toHaveBeenCalled();
  });

  it('treats a Nexus 404 as a failure, not as an already deleted tag file', async () => {
    vi.mocked(LocalTagCacheService.getViewerTagUri).mockResolvedValue(undefined);
    fetchTaggers().mockRejectedValue(
      Err.client(ClientErrorCode.NOT_FOUND, 'Absent', { service: ErrorService.Nexus, operation: 'taggers' }),
    );
    await expect(TagApplication.commitDelete(data)).rejects.toMatchObject({ code: ClientErrorCode.NOT_FOUND });
    expect(local.create).toHaveBeenCalledOnce();
    expect(LocalTagCacheService.completeMutation).not.toHaveBeenCalled();
  });

  it('restores the tag without a request when the session cannot write the app folder of the address', async () => {
    const tagUri = 'pubky://viewer/pub/mapky/tags/MAPKY01';
    vi.mocked(LocalTagCacheService.getViewerTagUri).mockResolvedValue(tagUri);
    const canWrite = vi.fn(() => false);
    await expect(TagApplication.commitDelete({ ...data, canWrite })).rejects.toMatchObject({
      code: AuthErrorCode.FORBIDDEN,
    });
    expect(canWrite).toHaveBeenCalledWith(tagUri);
    expect(HomeserverService.request).not.toHaveBeenCalled();
    expect(local.create).toHaveBeenCalledWith(expect.objectContaining({ synced: true, tagUri }));
    expect(LocalTagCacheService.completeMutation).not.toHaveBeenCalled();
  });

  it('deletes when the session can write the app folder of the address', async () => {
    await TagApplication.commitDelete({ ...data, canWrite: () => true });
    expect(deleteRequest()?.url).toBe(data.tagUrl);
    expect(LocalTagCacheService.completeMutation).toHaveBeenCalledOnce();
  });

  it('leaves local state and the homeserver untouched when the stored address cannot be read', async () => {
    vi.mocked(LocalTagCacheService.getViewerTagUri).mockRejectedValue(new Error('database unavailable'));
    await expect(TagApplication.commitDelete(data)).rejects.toThrow('database unavailable');
    expect(local.delete).not.toHaveBeenCalled();
    expect(HomeserverService.request).not.toHaveBeenCalled();
  });

  it('asks Nexus when the stored address is the viewer own file but not a tag', async () => {
    vi.mocked(LocalTagCacheService.getViewerTagUri).mockResolvedValue('pubky://viewer/pub/pubky.app/posts/POST01');
    fetchTaggers().mockResolvedValue({ users: ['viewer'], relationship: true, tag_uri: data.tagUrl });
    await TagApplication.commitDelete(data);
    expect(fetchTaggers()).toHaveBeenCalledOnce();
    expect(deleteRequest()?.url).toBe(data.tagUrl);
  });

  it('restores the tag with the address it failed to delete', async () => {
    vi.mocked(HomeserverService.request).mockRejectedValue(new Error('offline'));
    await expect(TagApplication.commitDelete(data)).rejects.toThrow('offline');
    expect(local.create).toHaveBeenCalledWith(expect.objectContaining({ tagUri: data.tagUrl }));
  });
});

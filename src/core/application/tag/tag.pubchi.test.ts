import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TagApplication } from '@/application/tag/tag';
import { TagKind } from '@/application/tag/tag.types';
import { AuthErrorCode, ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { sha256Hex } from '@/libs/pubchi/schemas/canonical';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { installHomeserverWriteRetryDependenciesForTests } from '@/services/homeserver/write-retry';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';

vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: { request: vi.fn(), getFreshBytes: vi.fn(), putBlob: vi.fn(), createWriteFence: vi.fn() },
}));
vi.mock('@/services/local/tag/post/tag.post', () => ({ LocalPostTagService: { create: vi.fn(), delete: vi.fn() } }));
vi.mock('@/services/local/tag/tag-cache', () => ({ LocalTagCacheService: { completeMutation: vi.fn() } }));

const tag = TagNormalizer.from({
  taggedKind: TagKind.POST,
  taggedId: `${fakeOwner(1)}:0033SSE3B1FQ0`,
  taggerId: fakeOwner(2),
  label: 'builder',
});
const tagObject = JSON.parse(new TextDecoder().decode(tag.tagBody));
const encoded = (obj: unknown) => new TextEncoder().encode(JSON.stringify(obj, null, 2));
let generation = 1;
const retrySleep = vi.fn<(delayMs: number) => Promise<void>>();
const commit = () => TagApplication.commitCreate({ tagList: [tag], preserveExisting: true });

describe('Pubchi tag adoption', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Native WebCrypto can finish after a fake-timer drain. Control only retry
    // backoff so every operation settles before the next test uses the tag queue.
    retrySleep.mockResolvedValue();
    installHomeserverWriteRetryDependenciesForTests({ sleep: retrySleep });
    generation = 1;
    vi.mocked(LocalPostTagService.create).mockResolvedValue(true);
    vi.mocked(LocalPostTagService.delete).mockResolvedValue(true);
    vi.mocked(HomeserverService.putBlob).mockResolvedValue(undefined);
    vi.mocked(HomeserverService.getFreshBytes).mockResolvedValue(null);
    vi.mocked(HomeserverService.request).mockResolvedValue(undefined);
    vi.mocked(HomeserverService.createWriteFence).mockImplementation(() => {
      const captured = generation;
      const assertCurrent = () => {
        if (captured !== generation)
          throw Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Session ended', {
            service: ErrorService.Homeserver,
            operation: 'test',
          });
      };
      return { enter: assertCurrent, assertCurrent };
    });
  });
  afterEach(() => {
    installHomeserverWriteRetryDependenciesForTests(null);
  });

  it('preserves existing bytes, including extensions and their original formatting, without a PUT', async () => {
    const remote = encoded({ ...tagObject, created_at: 10, extension: { author: 'other-client' } });
    vi.mocked(HomeserverService.getFreshBytes).mockResolvedValue(remote);
    await expect(commit()).resolves.toEqual({
      tagUrl: tag.tagUrl,
      alreadyExisted: true,
      tagDocumentSha256: await sha256Hex(remote),
    });
    expect(HomeserverService.getFreshBytes).toHaveBeenCalledWith(tag.tagUrl, { notFoundAsNull: true });
    expect(HomeserverService.putBlob).not.toHaveBeenCalled();
    expect(LocalPostTagService.delete).not.toHaveBeenCalled();
  });

  it('adopts a tag another device created during backoff without overwriting it', async () => {
    const remote = encoded({ ...tagObject, extension: 2 });
    vi.mocked(HomeserverService.getFreshBytes).mockResolvedValueOnce(null).mockResolvedValueOnce(remote);
    vi.mocked(HomeserverService.putBlob).mockRejectedValueOnce(
      Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'busy', {
        service: ErrorService.Homeserver,
        operation: 'test',
        context: { statusCode: 503 },
      }),
    );
    await expect(commit()).resolves.toMatchObject({ alreadyExisted: true, tagDocumentSha256: await sha256Hex(remote) });
    expect(retrySleep).toHaveBeenCalledOnce();
    expect(HomeserverService.getFreshBytes).toHaveBeenCalledTimes(2);
    expect(HomeserverService.putBlob).toHaveBeenCalledExactlyOnceWith({
      url: tag.tagUrl,
      blob: tag.tagBody,
      fence: expect.any(Object),
    });
  });

  it('does not retry or write after the session changes during backoff', async () => {
    retrySleep.mockImplementation(async () => {
      generation += 1;
    });
    vi.mocked(HomeserverService.putBlob).mockRejectedValueOnce(
      Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'busy', {
        service: ErrorService.Homeserver,
        operation: 'test',
        context: { statusCode: 503 },
      }),
    );
    await expect(commit()).rejects.toMatchObject({ code: AuthErrorCode.SESSION_EXPIRED });
    expect(retrySleep).toHaveBeenCalledOnce();
    expect(HomeserverService.getFreshBytes).toHaveBeenCalledOnce();
    expect(HomeserverService.putBlob).toHaveBeenCalledOnce();
    expect(LocalPostTagService.delete).toHaveBeenCalledWith(
      expect.objectContaining({ expectedMutationId: expect.any(String), synced: true }),
    );
  });

  it('does not delete a preexisting local tag when its redundant write fails', async () => {
    vi.mocked(LocalPostTagService.create).mockResolvedValue(false);
    vi.mocked(HomeserverService.putBlob).mockRejectedValue(
      Err.client(ClientErrorCode.BAD_REQUEST, 'invalid', { service: ErrorService.Homeserver, operation: 'test' }),
    );
    await expect(commit()).rejects.toMatchObject({ code: ClientErrorCode.BAD_REQUEST });
    expect(LocalPostTagService.delete).not.toHaveBeenCalled();
  });

  it('writes the built bytes and hashes them only when the tag is absent', async () => {
    await expect(commit()).resolves.toMatchObject({
      alreadyExisted: false,
      tagDocumentSha256: await sha256Hex(tag.tagBody),
    });
    expect(HomeserverService.putBlob).toHaveBeenCalledExactlyOnceWith({
      url: tag.tagUrl,
      blob: tag.tagBody,
      fence: expect.any(Object),
    });
  });

  it('refuses a stored tag whose target and label do not match its hash id', async () => {
    vi.mocked(HomeserverService.getFreshBytes).mockResolvedValue(encoded({ ...tagObject, label: 'different' }));
    await expect(commit()).rejects.toThrow('Stored tag does not match its address');
    expect(HomeserverService.putBlob).not.toHaveBeenCalled();
  });

  it('deletes a tag only when its exact stored bytes match the applied proof', async () => {
    const proof = await sha256Hex(tag.tagBody);
    vi.mocked(HomeserverService.getFreshBytes).mockResolvedValue(tag.tagBody);
    await TagApplication.commitDeleteIfUnchanged({ ...tag, canWrite: () => true }, proof);
    expect(HomeserverService.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: HttpMethod.DELETE, url: tag.tagUrl }),
    );
  });

  it('preserves even a whitespace-only rewrite', async () => {
    vi.mocked(HomeserverService.getFreshBytes).mockResolvedValue(encoded(tagObject));
    await expect(
      TagApplication.commitDeleteIfUnchanged({ ...tag, canWrite: () => true }, await sha256Hex(tag.tagBody)),
    ).rejects.toThrow('Tag changed');
    expect(HomeserverService.request).not.toHaveBeenCalled();
  });

  it('refuses a receipt hash for bytes that are not a tag at this address', async () => {
    const wrong = encoded({ ...tagObject, label: 'different' });
    vi.mocked(HomeserverService.getFreshBytes).mockResolvedValue(wrong);
    await expect(
      TagApplication.commitDeleteIfUnchanged({ ...tag, canWrite: () => true }, await sha256Hex(wrong)),
    ).rejects.toThrow('Stored tag does not match its address');
    expect(HomeserverService.request).not.toHaveBeenCalled();
  });

  it('refuses assisted undo when the current grant cannot delete the proven file', async () => {
    const proof = await sha256Hex(tag.tagBody);
    const canWrite = vi.fn(() => false);

    await expect(TagApplication.commitDeleteIfUnchanged({ ...tag, canWrite }, proof)).rejects.toMatchObject({
      code: AuthErrorCode.FORBIDDEN,
    });

    expect(canWrite).toHaveBeenCalledWith(tag.tagUrl);
    expect(HomeserverService.getFreshBytes).not.toHaveBeenCalled();
    expect(HomeserverService.request).not.toHaveBeenCalled();
    expect(LocalPostTagService.create).toHaveBeenCalledWith(
      expect.objectContaining({ expectedMutationId: expect.any(String), tagUri: tag.tagUrl }),
    );
  });

  it('refuses a different owner undo address before any optimistic deletion or fallback lookup', async () => {
    const proof = await sha256Hex(tag.tagBody);
    await expect(
      TagApplication.commitDeleteIfUnchanged(
        { ...tag, tagUrl: tag.tagUrl.replace(tag.taggerId, fakeOwner(3)), canWrite: () => true },
        proof,
      ),
    ).rejects.toThrow('does not belong to the owner');
    expect(LocalPostTagService.delete).not.toHaveBeenCalled();
    expect(HomeserverService.request).not.toHaveBeenCalled();
  });

  it('preserves a manually recreated tag at the same URL', async () => {
    const proof = await sha256Hex(tag.tagBody);
    vi.mocked(HomeserverService.getFreshBytes).mockResolvedValue(encoded({ ...tagObject, created_at: 300 }));

    await expect(TagApplication.commitDeleteIfUnchanged({ ...tag, canWrite: () => true }, proof)).rejects.toThrow(
      'Tag changed',
    );

    expect(HomeserverService.request).not.toHaveBeenCalled();
    expect(LocalPostTagService.create).toHaveBeenCalledWith(
      expect.objectContaining({ expectedMutationId: expect.any(String), synced: true }),
    );
  });

  it('rereads a replacement after a transient DELETE failure and refuses a second DELETE', async () => {
    const proof = await sha256Hex(tag.tagBody);
    vi.mocked(HomeserverService.getFreshBytes)
      .mockResolvedValueOnce(tag.tagBody)
      .mockResolvedValueOnce(encoded({ ...tagObject, created_at: 301 }));
    vi.mocked(HomeserverService.request).mockRejectedValueOnce(
      Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'busy', {
        service: ErrorService.Homeserver,
        operation: 'test',
        context: { statusCode: 503 },
      }),
    );
    await expect(TagApplication.commitDeleteIfUnchanged({ ...tag, canWrite: () => true }, proof)).rejects.toThrow(
      'Tag changed',
    );
    expect(retrySleep).toHaveBeenCalledOnce();

    expect(HomeserverService.getFreshBytes).toHaveBeenCalledTimes(2);
    expect(HomeserverService.request).toHaveBeenCalledOnce();
    expect(LocalPostTagService.create).toHaveBeenCalledWith(
      expect.objectContaining({ expectedMutationId: expect.any(String) }),
    );
  });

  it('refuses undo without proof before any local or remote deletion', async () => {
    await expect(TagApplication.commitDeleteIfUnchanged({ ...tag, canWrite: () => true }, '')).rejects.toThrow(
      'verifiable document proof',
    );
    expect(LocalPostTagService.delete).not.toHaveBeenCalled();
    expect(HomeserverService.getFreshBytes).not.toHaveBeenCalled();
    expect(HomeserverService.request).not.toHaveBeenCalled();
  });
});

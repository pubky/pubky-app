import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TagApplication } from '@/application/tag/tag';
import { TagKind, type TCreateTagInput } from '@/application/tag/tag.types';
import { AuthErrorCode, ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { canonicalJson, sha256Hex } from '@/libs/pubchi/schemas/canonical';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { installHomeserverWriteRetryDependenciesForTests } from '@/services/homeserver/write-retry';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';

vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: { request: vi.fn(), requestRawText: vi.fn(), createWriteFence: vi.fn() },
}));
vi.mock('@/services/local/tag/post/tag.post', () => ({ LocalPostTagService: { create: vi.fn(), delete: vi.fn() } }));
vi.mock('@/services/local/tag/tag-cache', () => ({ LocalTagCacheService: { completeMutation: vi.fn() } }));

const tag: TCreateTagInput = {
  taggedKind: TagKind.POST,
  taggedId: 'author:post',
  taggerId: 'owner',
  label: 'builder',
  tagUrl: 'pubky://owner/pub/pubky.app/tags/id',
  tagJson: { uri: 'pubky://author/pub/pubky.app/posts/post', label: 'builder', created_at: 200 },
};
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

  it('reports an existing tag and preserves its creation time and extension fields', async () => {
    const remote = { ...tag.tagJson, created_at: 10, extension: { author: 'other-client' } };
    vi.mocked(HomeserverService.requestRawText).mockResolvedValue(JSON.stringify(remote));
    await expect(commit()).resolves.toEqual({
      tagUrl: tag.tagUrl,
      alreadyExisted: true,
      tagDocumentSha256: await sha256Hex(canonicalJson(remote)),
    });
    expect(HomeserverService.request).toHaveBeenCalledWith(expect.objectContaining({ bodyJson: remote }));
    expect(LocalPostTagService.delete).not.toHaveBeenCalled();
  });

  it('rereads a changed extension before a retry instead of replaying an older body', async () => {
    vi.mocked(HomeserverService.requestRawText)
      .mockResolvedValueOnce(JSON.stringify({ ...tag.tagJson, extension: 1 }))
      .mockResolvedValueOnce(JSON.stringify({ ...tag.tagJson, extension: 2 }));
    vi.mocked(HomeserverService.request).mockRejectedValueOnce(
      Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'busy', {
        service: ErrorService.Homeserver,
        operation: 'test',
        context: { statusCode: 503 },
      }),
    );
    await expect(commit()).resolves.toMatchObject({ alreadyExisted: true });
    expect(retrySleep).toHaveBeenCalledOnce();
    expect(HomeserverService.requestRawText).toHaveBeenCalledTimes(2);
    expect(HomeserverService.request).toHaveBeenLastCalledWith(
      expect.objectContaining({ bodyJson: expect.objectContaining({ extension: 2 }) }),
    );
  });

  it('does not retry or write after the session changes during backoff', async () => {
    vi.mocked(HomeserverService.requestRawText).mockResolvedValue(JSON.stringify(tag.tagJson));
    retrySleep.mockImplementation(async () => {
      generation += 1;
    });
    vi.mocked(HomeserverService.request).mockRejectedValueOnce(
      Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'busy', {
        service: ErrorService.Homeserver,
        operation: 'test',
        context: { statusCode: 503 },
      }),
    );
    await expect(commit()).rejects.toMatchObject({ code: AuthErrorCode.SESSION_EXPIRED });
    expect(retrySleep).toHaveBeenCalledOnce();
    expect(HomeserverService.requestRawText).toHaveBeenCalledOnce();
    expect(HomeserverService.request).toHaveBeenCalledOnce();
    expect(LocalPostTagService.delete).toHaveBeenCalledWith(
      expect.objectContaining({ expectedMutationId: expect.any(String), synced: true }),
    );
  });

  it('does not delete a preexisting local tag when its redundant write fails', async () => {
    vi.mocked(LocalPostTagService.create).mockResolvedValue(false);
    vi.mocked(HomeserverService.requestRawText).mockResolvedValue(JSON.stringify(tag.tagJson));
    vi.mocked(HomeserverService.request).mockRejectedValue(
      Err.client(ClientErrorCode.BAD_REQUEST, 'invalid', { service: ErrorService.Homeserver, operation: 'test' }),
    );
    await expect(commit()).rejects.toMatchObject({ code: ClientErrorCode.BAD_REQUEST });
    expect(LocalPostTagService.delete).not.toHaveBeenCalled();
  });

  it('creates only on an explicit 404 and refuses a mismatched remote tag', async () => {
    vi.mocked(HomeserverService.requestRawText).mockRejectedValueOnce(
      Err.client(ClientErrorCode.NOT_FOUND, 'missing', {
        service: ErrorService.Homeserver,
        operation: 'test',
        context: { statusCode: 404 },
      }),
    );
    await expect(commit()).resolves.toMatchObject({ alreadyExisted: false });
    vi.mocked(HomeserverService.request).mockClear();
    vi.mocked(HomeserverService.requestRawText).mockResolvedValue(
      JSON.stringify({ ...tag.tagJson, label: 'different' }),
    );
    await expect(commit()).rejects.toThrow('Tag identity mismatch');
    expect(HomeserverService.request).not.toHaveBeenCalled();
  });

  it('deletes a tag only when its canonical document matches the applied proof', async () => {
    const proof = await sha256Hex(canonicalJson(tag.tagJson));
    vi.mocked(HomeserverService.requestRawText).mockResolvedValue(JSON.stringify(tag.tagJson, null, 2));

    await TagApplication.commitDeleteIfUnchanged(tag, proof);

    expect(HomeserverService.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: HttpMethod.DELETE, url: tag.tagUrl }),
    );
  });

  it('preserves a manually recreated tag at the same URL', async () => {
    const proof = await sha256Hex(canonicalJson(tag.tagJson));
    vi.mocked(HomeserverService.requestRawText).mockResolvedValue(JSON.stringify({ ...tag.tagJson, created_at: 300 }));

    await expect(TagApplication.commitDeleteIfUnchanged(tag, proof)).rejects.toThrow('Tag changed');

    expect(HomeserverService.request).not.toHaveBeenCalled();
    expect(LocalPostTagService.create).toHaveBeenCalledWith(
      expect.objectContaining({ expectedMutationId: expect.any(String), synced: true }),
    );
  });

  it('rereads a replacement after a transient DELETE failure and refuses a second DELETE', async () => {
    const proof = await sha256Hex(canonicalJson(tag.tagJson));
    vi.mocked(HomeserverService.requestRawText)
      .mockResolvedValueOnce(JSON.stringify(tag.tagJson))
      .mockResolvedValueOnce(JSON.stringify({ ...tag.tagJson, created_at: 301 }));
    vi.mocked(HomeserverService.request).mockRejectedValueOnce(
      Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'busy', {
        service: ErrorService.Homeserver,
        operation: 'test',
        context: { statusCode: 503 },
      }),
    );
    await expect(TagApplication.commitDeleteIfUnchanged(tag, proof)).rejects.toThrow('Tag changed');
    expect(retrySleep).toHaveBeenCalledOnce();

    expect(HomeserverService.requestRawText).toHaveBeenCalledTimes(2);
    expect(HomeserverService.request).toHaveBeenCalledOnce();
    expect(LocalPostTagService.create).toHaveBeenCalledWith(
      expect.objectContaining({ expectedMutationId: expect.any(String) }),
    );
  });

  it('refuses undo without proof before any local or remote deletion', async () => {
    await expect(TagApplication.commitDeleteIfUnchanged(tag, '')).rejects.toThrow('verifiable document proof');
    expect(LocalPostTagService.delete).not.toHaveBeenCalled();
    expect(HomeserverService.requestRawText).not.toHaveBeenCalled();
    expect(HomeserverService.request).not.toHaveBeenCalled();
  });
});

import { buildFile, buildPost, toPath } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { PostApplication } from '@/application/post/post';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { FileDetailsModel } from '@/models/file/fileDetails';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalFileService } from '@/services/local/file/file';
import { useAuthStore } from '@/stores/auth/auth.store';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';
import { createTestWebLocks } from '@/test-utils/web-locks';

const OWNER = fakeOwner(1) as Pubky;

type TPost = ReturnType<typeof buildPost>;
type TCreate = Pick<typeof PostApplication, 'commitCreate'>;

/**
 * Real `PostApplication`, `FileApplication`, `LocalFileService` and IndexedDB over the in-memory
 * homeserver. Media is content addressed: two pending creates of one owner that carry the same
 * bytes upload one file X and share its one local row. A rollback of one of them must leave X to
 * the other while that other create has no post row yet (it still uploads another file), as
 * dev's per-upload file rows did: each upload claims the row, and a rollback releases only its
 * own claim (r4 finding 1).
 */
describe('a rollback beside another pending create of the same bytes', () => {
  let homeserver: ReturnType<typeof stubMemoryHomeserver>;
  let localCreate: MockInstance<typeof LocalFileService.create>;

  const attachment = (byte: number): TFileAttachmentResult => {
    const bytes = new Uint8Array([byte, byte, byte]);
    return {
      media: buildFile(OWNER, { bytes, type: 'image/png' }),
      bytes,
      name: `${byte}.png`,
      contentType: 'image/png',
    };
  };
  const stored = (url: string) => homeserver.session.storage.exists(toPath(url));
  const fileRow = (file: TFileAttachmentResult) =>
    FileDetailsModel.table.get(buildCompositeId({ pubky: OWNER, id: file.media.id }));
  const imagePost = (content: string, files: TFileAttachmentResult[]) =>
    buildPost(OWNER, { kind: 'image', content, attachments: files.map(({ media }) => ({ uri: media.url })) });
  const refused = (url: string) =>
    Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, `Homeserver refused ${url}`, {
      service: ErrorService.Homeserver,
      operation: 'putBlob',
    });
  /** Starts a create through `application` (this tab's by default); resolves 'ok' or the error. */
  const create = (post: TPost, fileAttachments: TFileAttachmentResult[], application: TCreate = PostApplication) =>
    application.commitCreate({ compositePostId: `${OWNER}:${post.id}`, post, fileAttachments }).then(
      () => 'ok' as const,
      (error: unknown) => error,
    );
  /** Waits until the `count`th local row write of an upload has settled. */
  const rowWritten = async (count: number, spy: MockInstance<typeof LocalFileService.create> = localCreate) => {
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(count));
    await spy.mock.results[count - 1].value;
  };
  /** Holds the PUT of Y once taken, until `releaseY`; fails every PUT of `refusedUrl`. */
  const holdY = (y: TFileAttachmentResult, refusedUrl: string, onPut?: (url: string) => Promise<void>) => {
    const putBlob = homeserver.spies.putBlob.getMockImplementation()!;
    const yTaken = Promise.withResolvers<void>();
    const releaseY = Promise.withResolvers<void>();
    homeserver.spies.putBlob.mockImplementation(async (params) => {
      await onPut?.(params.url);
      if (params.url === refusedUrl) throw refused(params.url);
      if (params.url === y.media.url) {
        yTaken.resolve();
        await releaseY.promise;
      }
      return putBlob(params);
    });
    return { yTaken: yTaken.promise, releaseY: () => releaseY.resolve() };
  };
  /** X survived, with its row, and the create that kept it lists it. */
  const expectKept = async (x: TFileAttachmentResult, survivor: TPost, files: TFileAttachmentResult[]) => {
    expect(await stored(x.media.url)).toBe(true);
    expect(await fileRow(x)).toBeDefined();
    expect((await PostDetailsModel.findById(`${OWNER}:${survivor.id}`))?.attachments).toEqual(
      files.map(({ media }) => media.url),
    );
    expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalledWith(x.media.url);
  };

  beforeEach(() => {
    homeserver = stubMemoryHomeserver(OWNER);
    localCreate = vi.spyOn(LocalFileService, 'create');
    useAuthStore.setState({ currentUserPubky: OWNER });
    Object.defineProperty(navigator, 'locks', { value: createTestWebLocks(), configurable: true });
    vi.spyOn(Logger, 'debug').mockImplementation(() => {});
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'locks');
    vi.restoreAllMocks();
  });

  it('keeps X when B probed it after A uploaded it (B found it there)', async () => {
    const x = attachment(1);
    const y = attachment(2);
    const [xOfA, xOfB] = [{ ...x }, { ...x }];
    const postA = imagePost('A', [x]);
    const postB = imagePost('B', [x, y]);
    const aPostTaken = Promise.withResolvers<void>();
    const failAPost = Promise.withResolvers<void>();
    // A's post PUT is held once taken, then refused
    const { yTaken, releaseY } = holdY(y, postA.url, async (url) => {
      if (url !== postA.url) return;
      aPostTaken.resolve();
      await failAPost.promise;
    });

    const a = create(postA, [xOfA]);
    await aPostTaken.promise;
    const b = create(postB, [xOfB, y]);
    await yTaken;
    await rowWritten(2);
    expect(await PostDetailsModel.findById(`${OWNER}:${postB.id}`)).toBeNull();

    failAPost.resolve();
    expect(await a).not.toBe('ok');
    releaseY();
    expect(await b).toBe('ok');

    expect([xOfA.preexisting, xOfB.preexisting]).toEqual([false, true]);
    await expectKept(x, postB, [x, y]);
  });

  /**
   * Both probe X absent: A's PUT of X is held until B (through `application`, whose row writes
   * `spy` sees) has written its row, so A's row write lands last and A then rolls back.
   */
  const bothAbsentBWritesFirst = async (application: TCreate, spy?: MockInstance<typeof LocalFileService.create>) => {
    const x = attachment(1);
    const y = attachment(2);
    const [xOfA, xOfB] = [{ ...x }, { ...x }];
    const postA = imagePost('A', [x]);
    const postB = imagePost('B', [x, y]);
    const releaseAX = Promise.withResolvers<void>();
    let xPuts = 0;
    const { yTaken, releaseY } = holdY(y, postA.url, async (url) => {
      if (url === x.media.url && ++xPuts === 1) await releaseAX.promise;
    });

    const a = create(postA, [xOfA]);
    await vi.waitFor(() => expect(homeserver.spies.exists).toHaveBeenCalledTimes(1));
    const b = create(postB, [xOfB, y], application);
    await yTaken;
    await rowWritten(1, spy);
    releaseAX.resolve();
    expect(await a).not.toBe('ok');
    releaseY();
    expect(await b).toBe('ok');

    expect([xOfA.preexisting, xOfB.preexisting]).toEqual([false, false]);
    await expectKept(x, postB, [x, y]);
  };

  it('keeps X when both probed it absent and B wrote its row first', async () => {
    await bothAbsentBWritesFirst(PostApplication);
  });

  it('keeps X when both probed it absent and the later row writer rolls back', async () => {
    const x = attachment(1);
    const y = attachment(2);
    const [xOfA, xOfB] = [{ ...x }, { ...x }];
    const postA = imagePost('A', [x, y]);
    const postB = imagePost('B', [x]);
    const bothProbed = Promise.withResolvers<void>();
    const aRowWritten = Promise.withResolvers<void>();
    let xPuts = 0;
    const { yTaken, releaseY } = holdY(y, postB.url, async (url) => {
      if (url !== x.media.url) return;
      const put = ++xPuts;
      await bothProbed.promise;
      // B's PUT of X, the second, lands after A has written its row
      if (put === 2) await aRowWritten.promise;
    });

    const a = create(postA, [xOfA, y]);
    await yTaken;
    const b = create(postB, [xOfB]);
    await vi.waitFor(() => expect(homeserver.spies.exists).toHaveBeenCalledTimes(3));
    bothProbed.resolve();
    await rowWritten(1);
    aRowWritten.resolve();
    expect(await b).not.toBe('ok');
    releaseY();
    expect(await a).toBe('ok');

    expect([xOfA.preexisting, xOfB.preexisting]).toEqual([false, false]);
    await expectKept(x, postA, [x, y]);
  });

  it('still deletes X and its row when no other upload claims it', async () => {
    const x = attachment(1);
    const post = imagePost('A', [x]);
    holdY(attachment(2), post.url);

    expect(await create(post, [x])).toMatchObject({ message: `Homeserver refused ${post.url}` });

    expect(await stored(x.media.url)).toBe(false);
    expect(await fileRow(x)).toBeUndefined();
    expect(homeserver.spies.deleteIdempotent).toHaveBeenCalledWith(x.media.url);
  });

  it('keeps every claim the same bytes get in one batch apart, and releases them together', async () => {
    const x = attachment(1);
    const post = imagePost('A', [x, x]);
    let claimsAtPut: string[] | undefined;
    holdY(attachment(2), post.url, async (url) => {
      if (url === post.url) claimsAtPut = (await fileRow(x))?.upload_claims;
    });

    expect(await create(post, [{ ...x }, { ...x }])).toMatchObject({ message: `Homeserver refused ${post.url}` });

    expect(claimsAtPut).toHaveLength(2);
    expect(await stored(x.media.url)).toBe(false);
    expect(await fileRow(x)).toBeUndefined();
  });

  describe('in another tab', () => {
    let otherTab: Awaited<ReturnType<typeof openOtherTab>> | null = null;

    /**
     * Another tab of the app: a second instance of every module, sharing only what tabs share (the
     * one IndexedDB behind both Dexie instances, `navigator.locks`, the homeserver). Its homeserver
     * calls go to this tab's in-memory homeserver.
     */
    async function openOtherTab() {
      vi.resetModules();
      const { PostApplication: application } = await import('@/application/post/post');
      const { LocalFileService: localFiles } = await import('@/services/local/file/file');
      const { HomeserverService: service } = await import('@/services/homeserver/homeserver');
      const { useAuthStore: authStore } = await import('@/stores/auth/auth.store');
      const { db: database } = await import('@/database/franky/franky');
      vi.spyOn(service, 'exists').mockImplementation((url) => HomeserverService.exists(url));
      vi.spyOn(service, 'putBlob').mockImplementation((params) => HomeserverService.putBlob(params));
      vi.spyOn(service, 'deleteIdempotent').mockImplementation((url) => HomeserverService.deleteIdempotent(url));
      authStore.setState({ currentUserPubky: OWNER });
      return { application, localFiles, close: () => database.close() };
    }

    afterEach(() => {
      otherTab?.close();
      otherTab = null;
    });

    it("keeps X for a create in another tab whose row this tab's upload would otherwise replace", async () => {
      otherTab = await openOtherTab();
      await bothAbsentBWritesFirst(otherTab.application, vi.spyOn(otherTab.localFiles, 'create'));
    });

    it("never drops another tab's claim written while this tab releases its own", async () => {
      otherTab = await openOtherTab();
      const x = attachment(1);
      const fileId = buildCompositeId({ pubky: OWNER, id: x.media.id });
      // Each round: this tab releases its claim while the other tab writes a fresh one, at once.
      for (let round = 0; round < 10; round += 1) {
        const mine = `mine-${round}`;
        const theirs = `theirs-${round}`;
        await LocalFileService.create({ ...x, claim: mine });
        await Promise.all([
          LocalFileService.releaseClaims({ fileId, claims: [mine] }),
          otherTab.localFiles.create({ ...x, claim: theirs }),
        ]);
        expect((await fileRow(x))?.upload_claims).toContain(theirs);
        expect((await fileRow(x))?.upload_claims).not.toContain(mine);
      }
    });
  });
});

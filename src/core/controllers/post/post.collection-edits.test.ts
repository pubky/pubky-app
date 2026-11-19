import { buildPost, decodeContent, decodeObject, encodeContent, toPath } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostController } from '@/controllers/post/post';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { CollectionPostContent } from '@/pipes/post/post.collection';
import { pickHeadVersion } from '@/pipes/post/post.head';
import { postReferenceSpellings } from '@/pipes/post/post.reference';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';
import { freezeSpecClock, restoreSpecClock } from '@/test-utils/spec-clock';
import { VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';
import { createTestWebLocks } from '@/test-utils/web-locks';

const OWNER = fakeOwner(1) as Pubky;
const CURATED = fakeOwner(2) as Pubky;
/**
 * The other tab's data-model clock, a second ahead of this tab's: pinning a clock restarts the package's mint guard,
 * so the same instant could mint an edit id this tab already used, and the other tab writes after this tab in every
 * test here, so its versions must sort above.
 */
const OTHER_TAB_NOW_MS = VRT_FROZEN_NOW_MS + 1_000;

/** A post of `CURATED` as a collection references it: the composite id the pickers pass, and both spellings. */
const curated = (id: string) => ({
  compositeId: buildCompositeId({ pubky: CURATED, id }),
  spellings: postReferenceSpellings(CURATED, id),
  /** The v1 reference, which a new item is written as. */
  uri: postReferenceSpellings(CURATED, id)[0],
  /** The 0.x reference, which a row Nexus served for a migrated collection may still spell. */
  legacyUri: postReferenceSpellings(CURATED, id)[1],
});
const P0 = curated('0035QZPT4QG00');
const P1 = curated('0035QZPT4QG10');
const P2 = curated('0035QZPT4QG1G');
const A = curated('0035QZPT4QG20');
const B = curated('0035QZPT4QG30');
const C = curated('00360AGX9THG2');

/**
 * Collection edits through the real `PostController`, `PostApplication`, `LocalPostService` and Dexie against the
 * in-memory homeserver, with the Web Locks a browser shares between tabs. The controller reads the collection row
 * before the post lock and sends a change (add, remove, reorder, details); under the lock the change is applied to
 * the stored head and to the row read there, so an operation queued behind another edit of the same collection
 * never writes the list it read before the lock (Greptile R7 P1 on #3140).
 */
describe('PostController collection edits under the post lock', () => {
  let homeserver: ReturnType<typeof stubMemoryHomeserver>;
  let otherTab: Awaited<ReturnType<typeof openOtherTab>> | null = null;
  /** Holds a failing test may leave, released after it so the next test does not wait on them. */
  const holds: Array<() => void> = [];
  /** The runs a test started, settled after it so none is still writing when the next test begins. */
  const runs: Promise<unknown>[] = [];
  const run = <T>(promise: Promise<T>) => {
    runs.push(promise.catch(() => undefined));
    return promise;
  };
  /** Web Locks as the browser provides them: one manager shared by every tab (every module instance). */
  let locks: LockManager;
  const lockOf = (postId: string) => `pubky-post-write:${OWNER}:${postId}`;
  /**
   * Resolves once `count` operations wait on the collection's post lock: an operation has read the row and queued
   * behind the edit in flight, so the next one started after this queues behind it, whatever the machine's speed.
   */
  const queued = (postId: string, count: number) =>
    vi.waitFor(async () =>
      expect(((await locks.query()).pending ?? []).filter(({ name }) => name === lockOf(postId))).toHaveLength(count),
    );

  /** The collection's stored version files; an empty directory is a 404 on the memory homeserver, read as none. */
  const versions = (postId: string) =>
    homeserver.session.storage
      .list(`/pub/social/v1/posts/${postId}/`, null, false, 100, false)
      .catch((error: { message?: string }) => {
        if (String(error?.message).startsWith('404')) return [] as string[];
        throw error;
      });
  /** The newest stored version, decoded as `readHead` reads it. */
  const head = async (postId: string) => {
    const url = pickHeadVersion(await versions(postId));
    if (!url) throw new Error('no version');
    return { url, post: decodeObject(url, await HomeserverService.getBytes(url), 'post') };
  };
  const headCollection = async (postId: string) => {
    const envelope = decodeContent((await head(postId)).post);
    if (envelope?.kind !== 'collection') throw new Error('not a collection');
    return envelope.content;
  };
  const headItems = async (postId: string) => (await headCollection(postId)).items.map(({ uri }) => uri);
  const row = async (compositeId: string) => {
    const found = await PostDetailsModel.findById(compositeId);
    if (!found) throw new Error(`no row for ${compositeId}`);
    return found;
  };
  const rowItems = async (compositeId: string) => {
    const content = CollectionPostContent.parse((await row(compositeId)).content);
    if (!content) throw new Error(`the row of ${compositeId} is not a collection`);
    return content.items;
  };

  const createCollection = async (name: string, items: string[] = [], coverImage?: string) => {
    const compositeId = await PostController.commitCreateCollection({ authorId: OWNER, name, items, coverImage });
    return { compositeId, postId: compositeId.split(':')[1] };
  };
  const add = (compositeId: string, post: ReturnType<typeof curated>, controller = PostController) =>
    controller.commitUpdateCollectionItem({ collectionId: compositeId, postId: post.compositeId, shouldAdd: true });
  const remove = (compositeId: string, post: ReturnType<typeof curated>) =>
    PostController.commitUpdateCollectionItem({
      collectionId: compositeId,
      postId: post.compositeId,
      shouldAdd: false,
    });
  const reorder = (compositeId: string, items: string[]) =>
    PostController.commitReorderCollectionItems({ collectionId: compositeId, items });
  const rename = (compositeId: string, name: string, coverImage: string | null = null) =>
    PostController.commitEditCollection({
      compositeCollectionId: compositeId,
      name,
      description: 'renamed',
      coverImage,
    });

  /**
   * A collection whose head is what another client (the migrator, say) wrote: items with notes and members this client
   * does not know, in the envelope and on an item. Its row is what Nexus serves for a migrated collection: the 0.x
   * `content` shape, items spelled `/pub/pubky.app/posts/{id}`.
   */
  const seedStoredCollection = async (content: Record<string, unknown>, rowContent: Record<string, unknown>) => {
    const built = buildPost(OWNER, { kind: 'collection', name: 'seed', items: [] });
    const raw = JSON.parse(new TextDecoder().decode(built.body)) as Record<string, unknown>;
    const bytes = new TextEncoder().encode(JSON.stringify({ ...raw, content: JSON.stringify(content) }));
    await homeserver.session.storage.putBytes(toPath(built.url), bytes);
    const compositeId = buildCompositeId({ pubky: OWNER, id: built.id });
    await PostDetailsModel.table.add({
      id: compositeId,
      content: JSON.stringify(rowContent),
      indexed_at: Date.now(),
      kind: 'collection',
      uri: `pubky://${OWNER}/pub/social/v1/posts/${built.id}`,
      attachments: null,
    });
    return { compositeId, postId: built.id, firstUrl: built.url };
  };

  /** Holds this tab's next version PUT once reached, until `release`; `taken` resolves meanwhile. */
  const holdNextPut = () => {
    const taken = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();
    holds.push(() => released.resolve());
    const put = homeserver.spies.putBlob.getMockImplementation();
    if (!put) throw new Error('the memory homeserver has no putBlob implementation');
    homeserver.spies.putBlob.mockImplementationOnce(async (params) => {
      taken.resolve();
      await released.promise;
      return put(params);
    });
    return { taken: taken.promise, release: () => released.resolve() };
  };

  /**
   * Another tab of the app: a second instance of every module, sharing only what tabs share (the one IndexedDB
   * behind both Dexie instances, `navigator.locks`, the homeserver). Its homeserver calls go to this tab's
   * in-memory homeserver. Its data-model clock is frozen too, through its own module instance, a second ahead
   * (`OTHER_TAB_NOW_MS`); `close` restores it.
   */
  async function openOtherTab() {
    vi.resetModules();
    const { PostController: controller } = await import('@/controllers/post/post');
    const { HomeserverService: service } = await import('@/services/homeserver/homeserver');
    const { db: database } = await import('@/database/franky/franky');
    const { useAuthStore: authStore } = await import('@/stores/auth/auth.store');
    const clock = await import('@/test-utils/spec-clock');
    clock.freezeSpecClock(OTHER_TAB_NOW_MS);
    authStore.setState({ currentUserPubky: OWNER, generation: 'g1' });
    vi.spyOn(service, 'putBlob').mockImplementation((params) => HomeserverService.putBlob(params));
    vi.spyOn(service, 'listAll').mockImplementation((params) => HomeserverService.listAll(params));
    vi.spyOn(service, 'getBytes').mockImplementation((url) => HomeserverService.getBytes(url));
    vi.spyOn(service, 'exists').mockImplementation((url) => HomeserverService.exists(url));
    return {
      controller,
      close: () => {
        clock.restoreSpecClock();
        database.close();
      },
    };
  }

  beforeEach(async () => {
    freezeSpecClock();
    homeserver = stubMemoryHomeserver(OWNER);
    useAuthStore.setState({ currentUserPubky: OWNER, generation: 'g1' });
    vi.spyOn(Logger, 'debug').mockImplementation(() => {});
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger, 'error').mockImplementation(() => {});
    await PostDetailsModel.table.clear();
    locks = createTestWebLocks();
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
  });

  afterEach(async () => {
    holds.splice(0).forEach((release) => release());
    await Promise.allSettled(runs.splice(0));
    Reflect.deleteProperty(navigator, 'locks');
    otherTab?.close();
    otherTab = null;
    vi.restoreAllMocks();
    useAuthStore.getState().reset();
    restoreSpecClock();
  });

  describe('operations queued behind an edit in flight, one tab', () => {
    it('projects a queued add onto the row as it is once the lock is free, before its own PUT lands', async () => {
      const { compositeId, postId } = await createCollection('reading');
      const first = holdNextPut();

      const adding = run(add(compositeId, P0));
      await first.taken;
      const second = holdNextPut();
      const queuedAdd = run(add(compositeId, P1));
      await queued(postId, 1);
      first.release();
      await second.taken;
      // The queued add holds the lock with its PUT held: its projection has landed on the row the first add
      // converged, as the delta applied to that row, not as the list it read before the lock.
      expect(await rowItems(compositeId)).toEqual([P1.uri, P0.uri]);
      expect(await headItems(postId)).toEqual([P0.uri]);

      second.release();
      await Promise.all([adding, queuedAdd]);
      expect(await headItems(postId)).toEqual([P1.uri, P0.uri]);
    });

    it('three quick adds, the first PUT held: the head and the row hold all three', async () => {
      const { compositeId, postId } = await createCollection('reading');
      const put = holdNextPut();

      const first = run(add(compositeId, P0));
      await put.taken;
      // The second queues on the lock without projecting; the third reads the row without the second's add.
      const second = run(add(compositeId, P1));
      await queued(postId, 1);
      const third = run(add(compositeId, P2));
      await queued(postId, 2);
      put.release();
      await Promise.all([first, second, third]);

      expect(await headItems(postId)).toEqual([P2.uri, P1.uri, P0.uri]);
      expect(await rowItems(compositeId)).toEqual([P2.uri, P1.uri, P0.uri]);
      expect(await versions(postId)).toHaveLength(4);
    });

    it('three quick removes, the first PUT held: every item is gone, none comes back', async () => {
      const { compositeId, postId } = await createCollection('reading', [A.uri, B.uri, C.uri]);
      const put = holdNextPut();

      const first = run(remove(compositeId, A));
      await put.taken;
      const second = run(remove(compositeId, B));
      await queued(postId, 1);
      const third = run(remove(compositeId, C));
      await queued(postId, 2);
      put.release();
      await Promise.all([first, second, third]);

      expect(await headItems(postId)).toEqual([]);
      expect(await rowItems(compositeId)).toEqual([]);
    });

    it('a rename queued behind two adds keeps both adds and lands its name and cover', async () => {
      const { compositeId, postId } = await createCollection('reading', [], 'https://example.com/old.png');
      const put = holdNextPut();

      const first = run(add(compositeId, P0));
      await put.taken;
      const second = run(add(compositeId, P1));
      await queued(postId, 1);
      const renaming = run(rename(compositeId, 'renamed', 'https://example.com/new.png'));
      await queued(postId, 2);
      put.release();
      await Promise.all([first, second, renaming]);

      const stored = await headCollection(postId);
      expect(stored.items.map(({ uri }) => uri)).toEqual([P1.uri, P0.uri]);
      expect(stored).toMatchObject({
        name: 'renamed',
        description: 'renamed',
        cover_image: 'https://example.com/new.png',
      });
      expect(await row(compositeId)).toMatchObject({ content: encodeContent(stored) });
    });

    it('an add queued behind a rename keeps the new name and cover', async () => {
      const { compositeId, postId } = await createCollection('reading', [], 'https://example.com/old.png');
      const put = holdNextPut();

      const first = run(add(compositeId, P0));
      await put.taken;
      const renaming = run(rename(compositeId, 'renamed', 'https://example.com/new.png'));
      await queued(postId, 1);
      const second = run(add(compositeId, P1));
      await queued(postId, 2);
      put.release();
      await Promise.all([first, renaming, second]);

      const stored = await headCollection(postId);
      expect(stored).toMatchObject({ name: 'renamed', cover_image: 'https://example.com/new.png' });
      expect(stored.items.map(({ uri }) => uri)).toEqual([P1.uri, P0.uri]);
      expect(await row(compositeId)).toMatchObject({ content: encodeContent(stored) });
    });

    it('a reorder queued behind two adds keeps the added items leading and the rest in the drafted order', async () => {
      const { compositeId, postId } = await createCollection('reading', [A.uri, B.uri]);
      const put = holdNextPut();

      const first = run(add(compositeId, P0));
      await put.taken;
      const second = run(add(compositeId, P1));
      await queued(postId, 1);
      // Drafted from the row before either add landed: [A, B] reversed.
      const reordering = run(reorder(compositeId, [B.uri, A.uri]));
      await queued(postId, 2);
      put.release();
      await Promise.all([first, second, reordering]);

      expect(await headItems(postId)).toEqual([P1.uri, P0.uri, B.uri, A.uri]);
      expect(await rowItems(compositeId)).toEqual([P1.uri, P0.uri, B.uri, A.uri]);
    });
  });

  describe('operations queued behind an edit in flight, two tabs', () => {
    it('adds from both tabs queued behind this tab’s held add are all in the head and the row', async () => {
      otherTab = await openOtherTab();
      const { compositeId, postId } = await createCollection('reading');
      const put = holdNextPut();

      const first = run(add(compositeId, P0));
      await put.taken;
      const second = run(add(compositeId, P1));
      await queued(postId, 1);
      const third = run(add(compositeId, P2, otherTab.controller));
      await queued(postId, 2);
      put.release();
      await Promise.all([first, second, third]);

      expect(await headItems(postId)).toEqual([P2.uri, P1.uri, P0.uri]);
      expect(await rowItems(compositeId)).toEqual([P2.uri, P1.uri, P0.uri]);
      expect(await versions(postId)).toHaveLength(4);
    });
  });

  describe('a change the head already holds', () => {
    it('an add of an item the head has (the row is stale) writes no version and converges the row to the head', async () => {
      const { compositeId, postId } = await createCollection('reading', [A.uri]);
      const stored = await head(postId);
      // The row lags the head: another device's add is on the homeserver and not in this row yet.
      await PostDetailsModel.table.update(compositeId, { content: JSON.stringify({ name: 'reading', items: [] }) });

      await expect(add(compositeId, A)).resolves.toBeUndefined();

      expect(await versions(postId)).toEqual([stored.url]);
      expect(await row(compositeId)).toMatchObject({ content: stored.post.content, deleted: false });
    });

    it('a remove of an item the head lacks (the row is stale) writes no version and converges the row to the head', async () => {
      const { compositeId, postId } = await createCollection('reading', [A.uri]);
      const stored = await head(postId);
      await PostDetailsModel.table.update(compositeId, {
        content: JSON.stringify({ name: 'reading', items: [A.uri, B.uri] }),
      });

      await expect(remove(compositeId, B)).resolves.toBeUndefined();

      expect(await versions(postId)).toEqual([stored.url]);
      expect(await row(compositeId)).toMatchObject({ content: stored.post.content, deleted: false });
    });
  });

  describe('what the stored head carries', () => {
    const storedHead = () => ({
      name: 'Saved posts',
      description: null,
      items: [
        { uri: A.uri, note: 'start here', extra: 1 },
        { uri: B.uri, note: null },
      ],
      cover_image: null,
      layout: null,
      mood: 'calm',
    });
    const nexusRow = () => ({ name: 'Saved posts', description: '', items: [A.legacyUri, B.legacyUri] });

    it('an add, a remove and a reorder keep every stored item’s spelling, note and unknown members', async () => {
      const { compositeId, postId } = await seedStoredCollection(storedHead(), nexusRow());

      await add(compositeId, P0);
      expect(await headCollection(postId)).toEqual({
        name: 'Saved posts',
        description: null,
        cover_image: null,
        layout: 'grid',
        items: [
          { uri: P0.uri, note: null },
          { uri: A.uri, note: 'start here', $unknown: '{"extra":1}' },
          { uri: B.uri, note: null },
        ],
        $unknown: '{"mood":"calm"}',
      });

      await remove(compositeId, B);
      expect((await headCollection(postId)).items).toEqual([
        { uri: P0.uri, note: null },
        { uri: A.uri, note: 'start here', $unknown: '{"extra":1}' },
      ]);

      // Drafted from the row, which spells A the 0.x way
      await reorder(compositeId, [A.legacyUri, P0.uri]);
      const stored = await headCollection(postId);
      expect(stored.items).toEqual([
        { uri: A.uri, note: 'start here', $unknown: '{"extra":1}' },
        { uri: P0.uri, note: null },
      ]);
      expect(stored.$unknown).toBe('{"mood":"calm"}');
      expect(await row(compositeId)).toMatchObject({ content: encodeContent(stored) });
    });

    it('a stored head this client cannot normalize fails the edit with its own message and writes nothing', async () => {
      // The package accepts the item reference; this client's collection rules do not.
      const { compositeId, postId, firstUrl } = await seedStoredCollection(
        { ...storedHead(), items: [{ uri: 'ftp://example.com/post', note: null }] },
        nexusRow(),
      );
      const before = await row(compositeId);

      await expect(add(compositeId, P0)).rejects.toMatchObject({
        message: 'The stored collection content is invalid',
        operation: 'toEdit',
      });

      expect(await versions(postId)).toEqual([firstUrl]);
      expect(await row(compositeId)).toMatchObject({ content: before.content, deleted: false });
    });
  });
});

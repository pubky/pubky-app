// @vitest-environment node
import { buildFile, buildFollow, buildPost, buildUri, buildUser, idMicros } from 'pubky-social-specs';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeNetwork } from '../../fakeNetwork';
import { createMemoryStore } from '../../memoryStore';
import { fakeTime } from '../../runtime.fixtures';
import { ALICE, at, BRAN, CLEO, DION, MINUTE_MS, T0 } from '../social.fixtures';
import type { SocialData } from '../social.types';
import { ViewMismatchError } from '../social.verify';
import { createSocialIndexer, type SocialIndexer } from '../socialIndexer';
import {
  legacyBlobUri,
  legacyFileRecord,
  legacyFileUriOf,
  legacyFollow,
  legacyId,
  legacyPath,
  legacyPost,
  legacyPostUri,
  legacyProfile,
  legacyTag,
} from './legacy.fixtures';
import { LEGACY_ROOT, legacySocialTree } from './legacyTree';

const DAY_MS = 24 * 60 * MINUTE_MS;
const DEBOUNCE = 250;

const made: SocialIndexer[] = [];

afterEach(() => {
  for (const indexer of made.splice(0)) expect(indexer.status().lastError).not.toBeInstanceOf(ViewMismatchError);
});

/**
 * Alice writes social v1 and follows bran and cleo. Bran has only the older tree and follows dion there; alice
 * replies to his older post and he tags her reply with its older spelling. Cleo moved: her older records are still
 * there beside their v1 copies, plus one older post and follow the move did not copy. Bran's older post attaches a
 * file: its record names the type and a blob of his.
 */
function world() {
  const network = new FakeNetwork().addHomeserver('hs1');
  for (const user of [ALICE, BRAN, CLEO, DION]) network.addUser(user, 'hs1');
  const put = (user: string, built: { path: string; body: Uint8Array }) => network.put(user, built.path, built.body);

  // Bran's post as the move will copy it, edited on the way; his older file says 'Old hello'.
  const b1 = at(1, () => buildPost(BRAN, { content: 'Old hello, moved' }));
  const c0 = at(2, () => buildPost(CLEO, { content: 'Copied' }));
  const c9 = at(3, () => buildPost(CLEO, { content: 'Never copied' }));
  const reply = at(4, () => buildPost(ALICE, { content: 'Hi bran', parent: buildUri(BRAN, 'post', b1.id) }));

  at(0, () => {
    put(ALICE, buildUser(ALICE, { name: 'Alice' }));
    put(ALICE, buildFollow(ALICE, BRAN));
    put(ALICE, buildFollow(ALICE, CLEO));
  });
  network.put(BRAN, legacyPath.profile, legacyProfile('Bran'));
  network.put(BRAN, legacyPath.follow(DION), legacyFollow());
  const file = { id: legacyId(1), blob: legacyBlobUri(BRAN, 'BLOB1') };
  network.put(BRAN, legacyPath.file(file.id), legacyFileRecord(file.blob));
  network.put(BRAN, legacyPath.blob('BLOB1'), new Uint8Array([1, 2, 3]));
  network.put(
    BRAN,
    legacyPath.post(b1.id),
    legacyPost({ content: 'Old hello', attachments: [legacyFileUriOf(BRAN, file.id)] }),
  );
  network.put(DION, legacyPath.profile, legacyProfile('Dion'));
  network.put(CLEO, legacyPath.profile, legacyProfile('Cleo before'));
  network.put(CLEO, legacyPath.follow(DION), legacyFollow());
  network.put(CLEO, legacyPath.post(c0.id), legacyPost({ content: 'Copied, as it was' }));
  network.put(CLEO, legacyPath.post(c9.id), legacyPost({ content: 'Never copied' }));
  put(CLEO, c0);
  at(2, () => put(CLEO, buildUser(CLEO, { name: 'Cleo' })));
  put(ALICE, reply);
  network.put(BRAN, legacyPath.tag('T1'), legacyTag(legacyPostUri(ALICE, reply.id), 'Nice'));

  const time = fakeTime(T0 + DAY_MS);
  const indexerOf = (legacy: boolean) => {
    const indexer = createSocialIndexer({
      transport: network,
      store: createMemoryStore<SocialData>(),
      now: () => time.clock.now,
      schedule: time.schedule,
      options: { verifyView: true },
      ...(legacy ? { legacyTree: legacySocialTree } : {}),
    });
    made.push(indexer);
    return indexer;
  };
  return { network, time, indexerOf, posts: { b1, c0, c9, reply }, file };
}

const filesByIds = (indexer: SocialIndexer, uris: string[]) =>
  indexer.request({ url: '/v0/files/by_ids', method: 'POST', body: JSON.stringify({ uris }) });

// A live answer of https://nexus.pubky.app/v0/files/by_ids, fetched on 2026-11-26, its urls trimmed to one variant.
// Only keys and value types are compared, never values.
const LIVE_FILE = {
  id: '003627ZJMPSN0',
  uri: 'pubky://7e6bpokw6nfsurcoyd997omqjnyhm4uyoh9eg1xwk96zmetin3ty/pub/pubky.app/files/003627ZJMPSN0',
  owner_id: '7e6bpokw6nfsurcoyd997omqjnyhm4uyoh9eg1xwk96zmetin3ty',
  indexed_at: 1795639705223,
  created_at: 1795639703090000,
  src: 'pubky://7e6bpokw6nfsurcoyd997omqjnyhm4uyoh9eg1xwk96zmetin3ty/pub/pubky.app/blobs/BFDQ6TSVXCHVHT4DAQ1866P41R',
  name: '55af7d58a032476da29960c74f22aa46.jpg',
  size: 180959,
  content_type: 'image/jpeg',
  urls: '{"main":"7e6bpokw6nfsurcoyd997omqjnyhm4uyoh9eg1xwk96zmetin3ty/003627ZJMPSN0/main"}',
  metadata: null,
};

const shapeOf = (value: object) =>
  Object.entries(value)
    .map(([field, item]) => `${field}:${item === null ? 'null' : typeof item}`)
    .sort();

describe('createSocialIndexer with the older tree', () => {
  it('serves the authors who have not moved from the older tree, and reaches whom they follow there', async () => {
    const { indexerOf, posts } = world();
    const indexer = indexerOf(true);
    indexer.start(ALICE);
    await indexer.whenSynced();
    const view = indexer.view();

    expect([...view.authors].sort()).toEqual([ALICE, BRAN, CLEO, DION].sort());
    expect(view.hopOf(DION)).toBe(2);
    expect(view.profile(BRAN)?.name).toBe('Bran');
    expect(view.profile(DION)?.name).toBe('Dion');
    expect(view.following(BRAN)).toEqual([DION]);
    expect(view.postsBy(BRAN).map(({ postId, data }) => [postId, data.content])).toEqual([[posts.b1.id, 'Old hello']]);
  });

  it('resolves references across trees to the same post', async () => {
    const { time, indexerOf, posts } = world();
    const indexer = indexerOf(true);
    indexer.start(ALICE);
    await indexer.whenSynced();
    // The tags' files follow the sync.
    await time.advance(DEBOUNCE);
    const view = indexer.view();

    expect(view.repliesTo(BRAN, posts.b1.id).map(({ postId }) => postId)).toEqual([posts.reply.id]);
    expect(view.tagsOnPost(ALICE, posts.reply.id)).toEqual([{ label: 'nice', taggers: [BRAN] }]);
    const answer = await indexer.request({ url: `/v1/post/${BRAN}/${posts.b1.id}`, method: 'GET' });
    expect(answer).toMatchObject({ status: 200, json: { counts: { replies: 1 } } });
  });

  it('reads an author with a v1 profile through v1 alone, so nothing of their older tree shows or doubles', async () => {
    const { indexerOf, posts } = world();
    const indexer = indexerOf(true);
    indexer.start(ALICE);
    await indexer.whenSynced();
    const view = indexer.view();

    expect(view.profile(CLEO)?.name).toBe('Cleo');
    expect(view.postsBy(CLEO).map(({ postId, data }) => [postId, data.content])).toEqual([[posts.c0.id, 'Copied']]);
    expect(view.post(CLEO, posts.c9.id)).toBeNull();
    expect(view.following(CLEO)).toEqual([]);
    expect(view.followers(DION)).toEqual([BRAN]);
  });

  it('drops an author older records on the next sync after they move', async () => {
    const { network, time, indexerOf, posts } = world();
    const indexer = indexerOf(true);
    indexer.start(ALICE);
    await indexer.whenSynced();
    await time.advance(DEBOUNCE);

    // The move writes the profile last.
    network.put(BRAN, posts.b1.path, posts.b1.body);
    const moved = buildUser(BRAN, { name: 'Bran moved' });
    network.put(BRAN, moved.path, moved.body);
    await indexer.refresh();
    await time.advance(DEBOUNCE);
    const view = indexer.view();

    expect(view.profile(BRAN)?.name).toBe('Bran moved');
    expect(view.postsBy(BRAN).map(({ postId, data }) => [postId, data.content])).toEqual([
      [posts.b1.id, 'Old hello, moved'],
    ]);
    expect(view.following(BRAN)).toEqual([]);
    expect(view.tagsOnPost(ALICE, posts.reply.id)).toEqual([]);
    expect(view.authors).not.toContain(DION);
  });

  it('loads one older post alone with its author profile', async () => {
    const { indexerOf, posts } = world();
    const indexer = indexerOf(true);
    indexer.start(null);

    await indexer.ensurePost(BRAN, posts.b1.id);

    const view = indexer.view();
    expect(view.post(BRAN, posts.b1.id)?.data.content).toBe('Old hello');
    expect(view.profile(BRAN)?.name).toBe('Bran');
    expect(view.membershipOf(BRAN)).toBe('referenced');
  });

  it('answers the file details of an older attachment from the file record read in the window', async () => {
    const { indexerOf, file } = world();
    const indexer = indexerOf(true);
    indexer.start(ALICE);
    await indexer.whenSynced();
    const v1File = buildFile(ALICE, { bytes: new Uint8Array([1]), type: 'image/png' }).url;

    const answer = await filesByIds(indexer, [legacyFileUriOf(BRAN, file.id), v1File, 'not a uri']);

    expect(answer).toMatchObject({
      status: 200,
      json: [
        {
          id: file.id,
          uri: legacyFileUriOf(BRAN, file.id),
          owner_id: BRAN,
          indexed_at: Math.floor(idMicros(file.id) / 1000),
          created_at: 1_790_000_000_000_000,
          src: file.blob,
          name: 'cat.png',
          size: 3,
          content_type: 'image/png',
          urls: JSON.stringify({ main: `${BRAN}/${file.id}/main` }),
          metadata: null,
        },
      ],
    });
    expect(answer.json).toHaveLength(1);
    if (Array.isArray(answer.json)) expect(shapeOf(answer.json[0])).toEqual(shapeOf(LIVE_FILE));
  });

  it('loads an older file record alone when the answer names it, for a post outside any scope', async () => {
    const { indexerOf, posts, file } = world();
    const indexer = indexerOf(true);
    indexer.start(null);
    await indexer.ensurePost(BRAN, posts.b1.id);
    const uri = legacyFileUriOf(BRAN, file.id);

    const before = await filesByIds(indexer, [uri]);
    expect(before).toMatchObject({
      status: 200,
      json: [],
      more: [{ kind: 'file', author: BRAN, path: legacyPath.file(file.id) }],
    });

    await indexer.ensureFile(BRAN, legacyPath.file(file.id));

    const after = await filesByIds(indexer, [uri]);
    expect(after).toMatchObject({ status: 200, json: [{ uri, name: 'cat.png', content_type: 'image/png' }] });
    expect(after.more).toBeUndefined();
  });

  it('serves no file record of an author read through v1', async () => {
    const { network, indexerOf } = world();
    const fileId = legacyId(2);
    network.put(CLEO, legacyPath.file(fileId), legacyFileRecord(legacyBlobUri(CLEO, 'BLOB2')));
    const indexer = indexerOf(true);
    indexer.start(ALICE);
    await indexer.whenSynced();

    expect(indexer.view().file(CLEO, legacyPath.file(fileId))).toBeNull();
    expect((await filesByIds(indexer, [legacyFileUriOf(CLEO, fileId)])).json).toEqual([]);
  });

  it('answers no file details and loads nothing without the older tree', async () => {
    const { network, indexerOf, file } = world();
    const indexer = indexerOf(false);
    indexer.start(ALICE);
    await indexer.whenSynced();
    const reads = network.reads.length;

    await indexer.ensureFile(BRAN, legacyPath.file(file.id));

    expect((await filesByIds(indexer, [legacyFileUriOf(BRAN, file.id)])).json).toEqual([]);
    expect(network.reads).toHaveLength(reads);
  });

  it('reads nothing of the older tree without it', async () => {
    const { network, indexerOf } = world();
    const indexer = indexerOf(false);
    indexer.start(ALICE);
    await indexer.whenSynced();
    const view = indexer.view();

    expect([...view.authors].sort()).toEqual([ALICE, BRAN, CLEO].sort());
    expect(view.profile(BRAN)).toBeNull();
    expect(view.postsBy(BRAN)).toEqual([]);
    expect(network.reads.flatMap(({ events }) => events).some(({ path }) => path.startsWith(LEGACY_ROOT))).toBe(false);
  });
});

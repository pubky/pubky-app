// @vitest-environment node
import { buildFollow, buildPost, buildUri, buildUser } from 'pubky-social-specs';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeNetwork } from '../../fakeNetwork';
import { createMemoryStore } from '../../memoryStore';
import { fakeTime } from '../../runtime.fixtures';
import { ALICE, at, BRAN, CLEO, DION, MINUTE_MS, T0 } from '../social.fixtures';
import type { SocialData } from '../social.types';
import { ViewMismatchError } from '../social.verify';
import { createSocialIndexer, type SocialIndexer } from '../socialIndexer';
import { legacyFollow, legacyPath, legacyPost, legacyPostUri, legacyProfile, legacyTag } from './legacy.fixtures';
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
 * there beside their v1 copies, plus one older post and follow the move did not copy.
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
  network.put(BRAN, legacyPath.post(b1.id), legacyPost({ content: 'Old hello' }));
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
  return { network, time, indexerOf, posts: { b1, c0, c9, reply } };
}

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
    const { indexerOf, posts } = world();
    const indexer = indexerOf(true);
    indexer.start(ALICE);
    await indexer.whenSynced();
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

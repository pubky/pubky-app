// @vitest-environment node
import { buildFollow, buildPost, buildTag, buildUri, buildUser, type BuiltPost, editPost } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import type { RecordEntry } from '../indexer.types';
import { createNexusRouter } from './nexusRouter';
import { createSocialQueries } from './queries/socialQueries';
import { createSocialDomain, PROFILE_PATH } from './social.domain';
import { ALICE, at, BRAN, CLEO, DION, HOMESERVER, MINUTE_MS, recordsOf, socialNetwork, T0 } from './social.fixtures';
import type { AuthorRecords, SocialData } from './social.types';
import { findViewMismatch } from './social.verify';
import { buildSocialState, buildSocialView, type SocialState, type SocialView, updateSocialState } from './social.view';

// Random changes to random authors, each step checked against a view built from scratch. The four fixture users
// get company so that a step changes few enough authors for the view to patch instead of combining again.

type Records = Map<string, RecordEntry<SocialData>>;

const domain = createSocialDomain();
const Z32 = 'ybndrfg8ejkmcpqxot1uwisza345h769';
const FIXTURE_USERS = [ALICE, BRAN, CLEO, DION];
/** Keys made from the fixture's by rewriting three characters, still 52 z-base32 characters. */
const EXTRA = Array.from({ length: 36 }, (_, i) => {
  const key = FIXTURE_USERS[i % 4];
  const n = i + 1;
  return key[0] + Z32[n % 32] + Z32[(n >> 5) % 32] + Z32[(n >> 2) % 32] + key.slice(4);
});
const LABELS = ['rust', 'pubky', 'dev'];

/** Deterministic, so a failing seed fails the same way again. */
function random(seed: number) {
  let state = seed >>> 0 || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  return {
    next,
    below: (n: number) => Math.floor(next() * n),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)],
  };
}

/** A network the steps write to: one homeserver whose cursor counts every write, and each author's records. */
function world(seed: number) {
  const rng = random(seed);
  const records: AuthorRecords[] = recordsOf(socialNetwork());
  for (const [i, author] of EXTRA.entries()) {
    records.push({ ...records[i % 4], author, hop: 2, graph: new Map(), activity: new Map() });
  }
  const removed: AuthorRecords[] = [];
  const posts = new Map<string, BuiltPost[]>();
  let cursor = 1000;
  let minute = 60;

  const recordOf = (author: string, built: { path: string; body: Uint8Array }): RecordEntry<SocialData> => {
    cursor += 1;
    const entry: RecordEntry<SocialData> = { kind: 'record', path: built.path, cursor: BigInt(cursor) };
    const data = domain.reduce(author, built.path, built.body);
    if (data !== null) entry.data = data;
    return entry;
  };
  const postIds = (entry: AuthorRecords) =>
    [...entry.activity.values()].flatMap(({ data }) => (data?.type === 'post' ? [data.postId] : []));

  /** One change of one author's records, as a new object: every other author's stays the same object. */
  function change(): string {
    const index = rng.below(records.length);
    const entry = records[index];
    const { author } = entry;
    const other = rng.pick(records);
    const targets = postIds(other);
    const activity: Records = new Map(entry.activity);
    const graph: Records = new Map(entry.graph);
    const write = (into: Records, built: { path: string; body: Uint8Array }) =>
      into.set(built.path, recordOf(author, built));
    const newPost = (build: () => BuiltPost, when = minute) => {
      const built = at(when, build);
      posts.set(author, [...(posts.get(author) ?? []), built]);
      write(activity, built);
    };
    const replace = (next: Partial<AuthorRecords>) => {
      records[index] = { ...entry, activity, graph, ...next };
    };
    minute += 1;
    const op = rng.below(19);
    if (op === 0) {
      newPost(() => buildPost(author, { content: `Hello pk:${other.author}` }));
    } else if (op === 1 && targets.length > 0) {
      const parent = buildUri(other.author, 'post', rng.pick(targets));
      newPost(() => buildPost(author, { content: 'Reply', parent }));
    } else if (op === 2 && targets.length > 0) {
      const embed = buildUri(other.author, 'post', rng.pick(targets));
      newPost(() => buildPost(author, { content: '', embed }));
    } else if (op === 3) {
      const mine = (posts.get(author) ?? []).filter(({ path }) => activity.has(path));
      const head = mine.length === 0 ? null : rng.pick(mine);
      if (head === null) return 'nothing to edit';
      const content = `Edited pk:${other.author}`;
      write(
        activity,
        at(minute, () => editPost(author, head.url, { ...head.object, content })),
      );
    } else if (op === 4) {
      const ids = postIds(entry);
      if (ids.length === 0) return 'nothing to delete';
      const postId = rng.pick(ids);
      for (const path of [...activity.keys()]) if (path.includes(`/posts/${postId}/`)) activity.delete(path);
      replace({ deleted: { posts: new Set([postId]), profile: false } });
      return 'delete post';
    } else if (op === 5) {
      const uri =
        targets.length > 0 && rng.next() < 0.5
          ? buildUri(other.author, 'post', rng.pick(targets))
          : buildUri(other.author, 'user');
      const label = rng.pick(LABELS);
      write(
        activity,
        at(minute, () => buildTag(author, uri, label)),
      );
    } else if (op === 6) {
      const tags = [...activity.values()].filter(({ data }) => data?.type === 'tag');
      if (tags.length === 0) return 'nothing to untag';
      activity.delete(rng.pick(tags).path);
    } else if (op === 7) {
      write(
        graph,
        at(minute, () => buildFollow(author, other.author)),
      );
    } else if (op === 8) {
      const follows = [...graph.keys()].filter((path) => path.includes('/follows/'));
      if (follows.length === 0) return 'nothing to unfollow';
      graph.delete(rng.pick(follows));
    } else if (op === 9) {
      write(
        graph,
        at(0, () => buildUser(author, { name: `User ${minute}` })),
      );
    } else if (op === 10) {
      // A record loses its data, as a body not fetched yet, or gets it back.
      const paths = [...activity.keys()];
      if (paths.length === 0) return 'no record';
      const path = rng.pick(paths);
      const found = activity.get(path);
      if (found === undefined) return 'no record';
      const { data, ...bare } = found;
      const built = (posts.get(author) ?? []).find((post) => post.path === path);
      const regained = built === undefined ? null : domain.reduce(author, path, built.body);
      if (data !== undefined) activity.set(path, bare);
      else if (regained !== null) activity.set(path, { ...bare, data: regained });
    } else if (op === 11) {
      replace({
        membership: rng.pick(['member', 'visited', 'referenced'] as const),
        loose: rng.next() < 0.5 ? new Map(entry.activity) : undefined,
      });
      return `membership ${records[index].membership}`;
    } else if (op === 12 && records.length > 8) {
      removed.push(...records.splice(index, 1));
      return 'author removed';
    } else if (op === 13 && removed.length > 0) {
      records.splice(rng.below(records.length + 1), 0, ...removed.splice(rng.below(removed.length), 1));
      return 'author added';
    } else if (op === 14) {
      // Backdated or future-dated: the table drops it or keeps it instead of others.
      newPost(() => buildPost(author, { content: 'Out of time' }), rng.pick([-500, 5, 30, minute + 100000]));
    } else if (op === 15) {
      replace({ hop: rng.below(4) });
      return 'hop';
    } else if (op === 16) {
      replace({ homeserver: entry.homeserver === HOMESERVER ? 'hs2' : HOMESERVER });
      return 'homeserver';
    } else if (op === 17) {
      graph.delete(PROFILE_PATH);
      replace({ deleted: { posts: new Set(), profile: true } });
      return 'profile deleted';
    } else {
      const tail = BigInt(cursor - rng.below(200));
      replace({
        activity: new Map([...activity].filter(([, record]) => record.cursor > tail)),
        history: { ...entry.history, activity: { complete: false, tail, held: false } },
      });
      return 'window';
    }
    replace({});
    return `op ${op}`;
  }

  return { records, removed, change, rng };
}

/** Requests answered through the router: feeds, counts, hot tags, notifications and bootstrap. */
async function answers(view: SocialView, users: readonly string[]): Promise<unknown[]> {
  const router = createNexusRouter(createSocialQueries(view, { seed: ALICE, now: () => T0 + 2000 * MINUTE_MS }));
  // A query the view cannot answer throws: both views must throw the same error.
  const get = (path: string) =>
    router
      .route({ url: `https://nexus.example/v1/${path}`, method: 'GET' })
      .catch((error: unknown) => (error instanceof Error ? { thrown: error.name, message: error.message } : error));
  const paths = [
    'stream/posts/keys?source=all&limit=50',
    `stream/posts/keys?source=following&observer_id=${ALICE}&limit=50`,
    `stream/posts/keys?source=all&sorting=total_engagement&limit=50`,
    'tags/hot?limit=20',
    `user/${ALICE}/notifications?limit=50`,
    `bootstrap/${ALICE}`,
    'stream/users/ids?source=most_followed&limit=20',
    'search/tags/by_prefix/r',
  ];
  for (const user of users)
    paths.push(`user/${user}/counts`, `stream/posts/keys?source=author&author_id=${user}&limit=50`);
  const out: unknown[] = [];
  for (const path of paths) out.push(await get(path));
  return out;
}

describe('updateSocialState', () => {
  it.each([1, 2, 3, 4, 5, 6])('answers as a fresh build after each random change, seed %i', async (seed) => {
    const { records, change, rng } = world(seed);
    let state: SocialState = buildSocialState(records);
    for (let step = 0; step < 30; step += 1) {
      const done: string[] = [];
      for (let k = 1 + rng.below(3); k > 0; k -= 1) done.push(change());
      state = updateSocialState(state, records);
      const fresh = buildSocialView(records);

      expect(findViewMismatch(fresh, state.view, records), `step ${step}: ${done.join(', ')}`).toBeNull();
      const users = records.slice(0, 6).map(({ author }) => author);
      expect(await answers(state.view, users), `step ${step}`).toEqual(await answers(fresh, users));
    }
  });

  it('keeps answering from an earlier view as it did, after later updates', async () => {
    const { records, change } = world(7);
    let state = buildSocialState(records);
    for (let step = 0; step < 5; step += 1) change();
    state = updateSocialState(state, records);
    const earlier = state.view;
    const earlierRecords = [...records];
    const users = records.slice(0, 6).map(({ author }) => author);
    const before = await answers(earlier, users);
    // Something answered from the earlier view fills its caches before the later updates.
    earlier.timeOf(ALICE, BigInt(10));

    for (let step = 0; step < 40; step += 1) {
      change();
      state = updateSocialState(state, records);
    }

    expect(state.view).not.toBe(earlier);
    expect(findViewMismatch(buildSocialView(earlierRecords), earlier, earlierRecords)).toBeNull();
    expect(await answers(earlier, users)).toEqual(before);
  });

  it('returns the same state when no author changed', () => {
    const records = recordsOf(socialNetwork());
    const state = buildSocialState(records);

    expect(updateSocialState(state, [...records])).toBe(state);
  });

  it('patches the reverse edges for a few changed authors and combines again for many', () => {
    const { records, change } = world(8);
    const state = buildSocialState(records);
    const before = [...records];
    while (records.length === before.length && records.every((entry, i) => entry === before[i])) change();
    const patched = updateSocialState(state, records);
    const patchedRecords = [...records];
    for (let step = 0; step < 30; step += 1) change();
    const combined = updateSocialState(patched, records);

    expect(patched.combined).not.toBe(state.combined);
    const kept = [...patched.parts].filter(([author, part]) => state.parts.get(author) === part);
    expect(kept.length).toBeGreaterThanOrEqual(patched.parts.size - 1);
    expect(findViewMismatch(buildSocialView(patchedRecords), patched.view, patchedRecords)).toBeNull();
    expect(findViewMismatch(buildSocialView(records), combined.view, records)).toBeNull();
  });
});

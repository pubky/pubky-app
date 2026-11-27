import {
  buildFollow,
  buildPost,
  buildTag,
  buildUri,
  buildUser,
  type BuiltPost,
  editPost,
  encodeContent,
} from 'pubky-social-specs';
import { vi } from 'vitest';
import type { Cursor, RecordEntry } from '../indexer.types';
import { createSocialDomain, PROFILE_PATH, SOCIAL_ACTIVITY, SOCIAL_GRAPH } from './social.domain';
import type { AuthorRecords, SocialData, UserData } from './social.types';

// Test-only: a small network written with the package's own builders, so paths, ids and bytes are real.

export const ALICE = '5kjj6uydjfsg1ojd83urbsos7omkosi5pmpa13hqec4ye5okhody';
export const BRAN = 'ajqyiyd8gkzct4ncoqzg48tye7k5mtba7aogkh8wpuct7tjk7gny';
export const CLEO = '3emxro3id6h55wz7agg9j64x4wx9oxschoo1o63uhjxskac6od3y';
export const DION = '6xek5rdncwb9uk1eih4w3qjzgt5ekqd5sbxr3shw4dd4ii9eofyy';
export const HOPS = new Map([
  [ALICE, 0],
  [BRAN, 1],
  [CLEO, 1],
  [DION, 2],
]);

/** The homeserver every fixture user publishes to, unless a test moves one. */
export const HOMESERVER = 'hs1';

/** The network's clock origin; everything is written within the hour after it. */
export const T0 = Date.UTC(2026, 9, 1);
export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export interface SocialFile {
  author: string;
  path: string;
  body: Uint8Array;
}

/** Runs `build` with the package's clock at `minute` minutes after `T0`, so every id is known to the minute. */
export function at<T>(minute: number, build: () => T): T {
  const now = vi.spyOn(Date, 'now').mockReturnValue(T0 + minute * MINUTE_MS);
  try {
    return build();
  } finally {
    now.mockRestore();
  }
}

const ref = (author: string, post: BuiltPost) => buildUri(author, 'post', post.id);
const file = (author: string, built: { path: string; body: Uint8Array }): SocialFile => ({
  author,
  path: built.path,
  body: built.body,
});

/**
 * Four users: alice and bran follow each other, alice and bran follow cleo, cleo follows dion. A reply chain
 * a1 <- b1 <- c1, a repost and a quote of a1, an edited article, a deleted post with a reply left behind, a
 * version whose file is not a post, an image, a collection, and tags on a1, on bran and on a web page.
 */
export function socialNetwork() {
  const a1 = at(1, () => buildPost(ALICE, { content: `Hello pk:${BRAN} and pubky${CLEO}` }));
  const b1 = at(2, () => buildPost(BRAN, { content: 'Welcome', parent: ref(ALICE, a1) }));
  const c1 = at(3, () => buildPost(CLEO, { content: 'Thanks both', parent: ref(BRAN, b1) }));
  const gone = at(4, () => buildPost(ALICE, { content: 'Gone soon' }));
  const orphan = at(5, () => buildPost(DION, { content: 'Replying to nothing', parent: ref(ALICE, gone) }));
  const repost = at(6, () => buildPost(BRAN, { content: '', embed: ref(ALICE, a1) }));
  const quote = at(7, () => buildPost(CLEO, { content: `Look pk:${ALICE}`, embed: ref(ALICE, a1) }));
  const article = at(8, () => buildPost(ALICE, { kind: 'article', title: 'On Pubky', body: 'Draft' }));
  const revised = encodeContent({ title: 'On Pubky, revised', body: `Final, thanks pk:${DION}`, cover_image: null });
  const articleEdit = at(9, () => editPost(ALICE, article.url, { ...article.object, content: revised }));
  const broken = at(10, () => buildPost(CLEO, { content: 'Served as garbage' }));
  const image = at(11, () =>
    buildPost(BRAN, {
      kind: 'image',
      content: 'A cat',
      attachments: [{ uri: 'https://example.com/cat.png', name: 'cat.png', alt: 'A cat' }],
    }),
  );
  const collection = at(12, () =>
    buildPost(DION, {
      kind: 'collection',
      name: 'Best of',
      items: [
        { uri: ref(ALICE, a1), note: 'start here' },
        { uri: ref(ALICE, article) },
        { uri: 'https://example.com/' },
      ],
    }),
  );
  const posts = { a1, b1, c1, gone, orphan, repost, quote, article, articleEdit, broken, image, collection };

  const writes: SocialFile[] = at(0, () => [
    file(ALICE, buildUser(ALICE, { name: 'Alice', bio: 'Local-first', status: 'Around' })),
    file(BRAN, buildUser(BRAN, { name: 'Bran', links: [{ title: 'Site', url: 'https://example.com/bran' }] })),
    file(CLEO, buildUser(CLEO, { name: 'Cleo', image: 'https://example.com/cleo.png' })),
    file(ALICE, buildFollow(ALICE, BRAN)),
    file(ALICE, buildFollow(ALICE, CLEO)),
    file(BRAN, buildFollow(BRAN, ALICE)),
    file(BRAN, buildFollow(BRAN, CLEO)),
    file(CLEO, buildFollow(CLEO, DION)),
  ]);
  writes.push(
    file(ALICE, a1),
    file(BRAN, b1),
    file(CLEO, c1),
    file(ALICE, gone),
    file(DION, orphan),
    file(BRAN, repost),
    file(CLEO, quote),
    file(ALICE, article),
    file(ALICE, articleEdit),
    { author: CLEO, path: broken.path, body: new TextEncoder().encode('{') },
    file(BRAN, image),
    file(DION, collection),
  );
  writes.push(
    ...at(13, () => [
      file(BRAN, buildTag(BRAN, ref(ALICE, a1), 'rust')),
      file(CLEO, buildTag(CLEO, ref(ALICE, a1), 'rust')),
      file(CLEO, buildTag(CLEO, ref(ALICE, a1), 'pubky')),
      file(DION, buildTag(DION, ref(ALICE, a1), 'rust')),
      file(ALICE, buildTag(ALICE, buildUri(BRAN, 'user'), 'friend')),
      file(CLEO, buildTag(CLEO, buildUri(BRAN, 'user'), 'friend')),
      file(DION, buildTag(DION, buildUri(BRAN, 'user'), 'dev')),
      file(ALICE, buildTag(ALICE, 'https://example.com/', 'web')),
    ]),
  );
  const deletes = [file(ALICE, gone)];
  return { posts, writes, deletes };
}

export type SocialNetwork = ReturnType<typeof socialNetwork>;

/** Both groups loaded from the author's first event. */
export const fullHistory = (): AuthorRecords['history'] => ({
  graph: { complete: true, tail: BigInt(0), held: false },
  activity: { complete: true, tail: BigInt(0), held: false },
});

/** What a full index serves for each user of the network: the files left after the deletes, reduced. */
export function recordsOf({ writes, deletes }: SocialNetwork): AuthorRecords[] {
  return recordsFrom(writes, HOPS, new Set(deletes.map(({ author, path }) => `${author}${path}`)));
}

/**
 * What a full index of one homeserver serves for `files` committed in order: each file's cursor is its position
 * from 1, deleted files (`{author}{path}`) left out, every user of `hops` with their whole history.
 */
export function recordsFrom(
  files: readonly SocialFile[],
  hops: ReadonlyMap<string, number>,
  deleted: ReadonlySet<string> = new Set(),
): AuthorRecords[] {
  const domain = createSocialDomain();
  const scopes = new Map<string, Map<string, RecordEntry<SocialData>>>();
  const scope = (author: string, group: string) => {
    const key = `${author}\u0000${group}`;
    const live = scopes.get(key) ?? new Map<string, RecordEntry<SocialData>>();
    scopes.set(key, live);
    return live;
  };
  files.forEach(({ author, path, body }, i) => {
    const group = domain.groups.find(({ paths }) => paths.some((prefix) => path.startsWith(prefix)));
    if (group === undefined || deleted.has(`${author}${path}`)) return;
    const record: RecordEntry<SocialData> = { kind: 'record', path, cursor: BigInt(i + 1) };
    const data = domain.needsBody(path) ? domain.reduce(author, path, body) : null;
    if (data !== null) record.data = data;
    scope(author, group.id).set(path, record);
  });
  return [...hops].map(([author, hop]): AuthorRecords => ({
    author,
    homeserver: HOMESERVER,
    membership: 'member',
    hop,
    graph: scope(author, SOCIAL_GRAPH),
    activity: scope(author, SOCIAL_ACTIVITY),
    history: fullHistory(),
  }));
}

/**
 * The records with the author's activity loaded only above `tail`, as a crawl window leaves it; `held` when a sync will
 * not read it further back.
 */
export function withPartialActivity(
  records: readonly AuthorRecords[],
  author: string,
  tail: Cursor,
  held = false,
): AuthorRecords[] {
  return records.map((entry) => {
    if (entry.author !== author) return entry;
    const activity = new Map([...entry.activity].filter(([, record]) => record.cursor > tail));
    return { ...entry, activity, history: { ...entry.history, activity: { complete: false, tail, held } } };
  });
}

/** The records with some fields of one author's replaced. */
export function withAuthor(
  records: readonly AuthorRecords[],
  author: string,
  change: Partial<AuthorRecords>,
): AuthorRecords[] {
  return records.map((entry) => (entry.author === author ? { ...entry, ...change } : entry));
}

/** The records with a bare profile served for `author`, for a test that needs one more user with a profile. */
export function withProfile(records: readonly AuthorRecords[], author: string, name: string): AuthorRecords[] {
  const data: UserData = { type: 'user', name, bio: null, image: null, links: [], status: null };
  const profile: RecordEntry<SocialData> = { kind: 'record', path: PROFILE_PATH, cursor: BigInt(0), data };
  return records.map((entry) => {
    if (entry.author !== author) return entry;
    const graph = new Map(entry.graph);
    graph.set(PROFILE_PATH, profile);
    return { ...entry, graph };
  });
}

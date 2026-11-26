import { IndexerError } from '../indexer.errors';
import type { Cursor, RecordEntry } from '../indexer.types';
import { socialV1Tree } from './social.domain';
import type { AuthorRecords, SocialData, SocialTarget } from './social.types';
import type { SocialView } from './social.view';

/** An updated view answered differently from the view built from scratch over the same records. */
export class ViewMismatchError extends IndexerError {
  readonly code = 'indexer.view.mismatch';
  readonly difference: string;

  constructor(difference: string) {
    super(`the updated view differs from a full build: ${difference}`);
    this.name = 'ViewMismatchError';
    this.difference = difference;
  }
}

const ONE = BigInt(1);
const NO_RECORDS: ReadonlyMap<string, RecordEntry<SocialData>> = new Map();
const show = (value: unknown) => JSON.stringify(value) ?? 'undefined';

/** Every user, post and file record the records name, to ask both views about. */
function subjects(records: readonly AuthorRecords[], views: readonly SocialView[]) {
  const users = new Set<string>();
  const posts = new Map<string, [string, string]>();
  const files: [string, string][] = [];
  const addPost = (author: string, postId: string) => posts.set(`${author}/${postId}`, [author, postId]);
  const addTarget = (target: SocialTarget | null) => {
    if (target === null || target.kind === 'other') return;
    users.add(target.author);
    if (target.kind === 'post') addPost(target.author, target.postId);
  };
  for (const { author, graph, activity, loose, deleted, tree = socialV1Tree } of records) {
    users.add(author);
    for (const map of [graph, activity, loose ?? NO_RECORDS]) {
      for (const path of map.keys()) {
        const key = tree.keyOf(author, path);
        if (key?.kind === 'post') addPost(author, key.postId);
        if (key?.kind === 'file') files.push([author, path]);
      }
    }
    for (const postId of deleted?.posts ?? []) addPost(author, postId);
  }
  for (const view of views) {
    for (const user of [...users]) {
      for (const followee of view.following(user)) users.add(followee);
      for (const tag of view.tagsBy(user)) addTarget(tag.target);
      for (const post of view.postsBy(user)) {
        addTarget(post.data.parent);
        addTarget(post.data.embed);
        for (const mentioned of post.data.mentions) users.add(mentioned);
        for (const { target } of post.data.items ?? []) addTarget(target);
      }
    }
  }
  return { users: [...users], posts: [...posts.values()], files };
}

/** Cursors to probe the time tables at: every record's, and either side of it. */
function cursorsOf({ graph, activity, loose, history }: AuthorRecords): Cursor[] {
  const cursors: Cursor[] = [];
  for (const map of [graph, activity, loose ?? NO_RECORDS]) {
    for (const { cursor } of map.values()) cursors.push(cursor - ONE, cursor, cursor + ONE);
  }
  for (const { tail } of [history.graph, history.activity]) if (tail !== null) cursors.push(tail);
  return cursors;
}

/**
 * The first answer `actual` gives differently from `expected` about anything the records name, `null` when they
 * agree on all of it. Asks every method of the view.
 */
export function findViewMismatch(
  expected: SocialView,
  actual: SocialView,
  records: Iterable<AuthorRecords>,
): string | null {
  const entries = [...records];
  const ask = (what: string, question: (view: SocialView) => unknown): string | null => {
    const want = show(question(expected));
    const got = show(question(actual));
    if (want === got) return null;
    let at = 0;
    while (want[at] === got[at]) at += 1;
    const from = Math.max(0, at - 100);
    return `${what}: expected ...${want.slice(from, from + 300)}, got ...${got.slice(from, from + 300)}`;
  };
  const { users, posts, files } = subjects(entries, [expected, actual]);
  const questions: [string, (view: SocialView) => unknown][] = [
    ['authors', (view) => view.authors],
    ['timeline', (view) => view.timeline(users)],
    ['timeline with replies', (view) => view.timeline(users, { includeReplies: true })],
  ];
  for (const user of users) {
    questions.push([
      `user ${user}`,
      (view) => ({
        membership: view.membershipOf(user),
        hop: view.hopOf(user),
        profile: view.profile(user),
        following: view.following(user),
        followers: view.followers(user),
        friends: view.friends(user),
        posts: view.postsBy(user),
        roots: view.rootPostsBy(user),
        replies: view.repliesBy(user),
        mentions: view.mentionsOf(user),
        tagsOn: view.tagsOnUser(user),
        tagsBy: view.tagsBy(user),
        counts: view.userCounts(user),
        graph: view.historyOf(user, 'graph'),
        activity: view.historyOf(user, 'activity'),
        deleted: view.profileDeleted(user),
        profileAt: view.profileAtMs(user),
        followedAt: view.following(user).map((followee) => view.followedAtMs(user, followee)),
      }),
    ]);
  }
  for (const [author, postId] of posts) {
    questions.push([
      `post ${author}/${postId}`,
      (view) => ({
        post: view.post(author, postId),
        replies: view.repliesTo(author, postId),
        reposts: view.repostsOf(author, postId),
        tags: view.tagsOnPost(author, postId),
        collections: view.collectionsContaining(author, postId),
        counts: view.postCounts(author, postId),
        deleted: view.postDeleted(author, postId),
      }),
    ]);
  }
  for (const [author, path] of files) questions.push([`file ${author}${path}`, (view) => view.file(author, path)]);
  for (const entry of entries) {
    const cursors = cursorsOf(entry);
    questions.push([`times of ${entry.author}`, (view) => cursors.map((cursor) => view.timeOf(entry.author, cursor))]);
  }
  for (const [what, question] of questions) {
    const difference = ask(what, question);
    if (difference !== null) return difference;
  }
  return null;
}

import { idMicros, type KnownPostKind } from 'pubky-social-specs';
import type { RecordEntry } from '../indexer.types';
import { followeeOfPath, locate, PROFILE_PATH } from './social.domain';
import type { AuthorRecords, PostData, SocialData, SocialTarget, TagData, UserData } from './social.types';

/** A logical post: its newest live version. */
export interface SocialPost {
  author: string;
  postId: string;
  editId: string;
  createdAtMs: number;
  /** When the newest version was written, `null` for a post never edited. */
  editedAtMs: number | null;
  data: PostData;
}

/** One label on a target and the users who put it there, sorted. */
export interface TagGroup {
  label: string;
  taggers: readonly string[];
}

export interface PostCounts {
  replies: number;
  reposts: number;
  /** Every label of every tagger. */
  tags: number;
  uniqueTags: number;
}

export interface UserCounts {
  /** Replies included. */
  posts: number;
  replies: number;
  following: number;
  followers: number;
  friends: number;
  tagsGiven: number;
  tagged: number;
}

export interface TimelineOptions {
  /** Every kind when absent. */
  kinds?: readonly KnownPostKind[];
  /** False by default. */
  includeReplies?: boolean;
}

/**
 * What the records of the authors in scope say, with every reverse edge resolved. Counts are scope counts:
 * only what these authors wrote is known. Lists of posts are newest first.
 */
export interface SocialView {
  readonly authors: readonly string[];
  hopOf(user: string): number | null;
  profile(user: string): UserData | null;
  /** Every user the user follows, in scope or not. */
  following(user: string): readonly string[];
  /** The authors in scope who follow the user. */
  followers(user: string): readonly string[];
  /** Users followed back. */
  friends(user: string): readonly string[];
  post(author: string, postId: string): SocialPost | null;
  postsBy(author: string): readonly SocialPost[];
  rootPostsBy(author: string): readonly SocialPost[];
  repliesBy(author: string): readonly SocialPost[];
  repliesTo(author: string, postId: string): readonly SocialPost[];
  /** Posts embedding it, as a repost or a quote. */
  repostsOf(author: string, postId: string): readonly SocialPost[];
  mentionsOf(user: string): readonly SocialPost[];
  tagsOnPost(author: string, postId: string): readonly TagGroup[];
  tagsOnUser(user: string): readonly TagGroup[];
  tagsBy(user: string): readonly TagData[];
  collectionsContaining(author: string, postId: string): readonly SocialPost[];
  postCounts(author: string, postId: string): PostCounts;
  userCounts(user: string): UserCounts;
  /** The authors' posts merged, newest first. */
  timeline(authors: Iterable<string>, options?: TimelineOptions): SocialPost[];
}

const NONE: readonly never[] = Object.freeze([]);
const postKey = (author: string, postId: string) => `${author}/${postId}`;
const userKey = (user: string) => `user/${user}`;

/** The key of what a target names, `null` for a target outside the social tree. */
function targetKey(target: SocialTarget): string | null {
  if (target.kind === 'post') return postKey(target.author, target.postId);
  if (target.kind === 'user') return userKey(target.author);
  return null;
}

const msOf = (id: string) => Math.floor(idMicros(id) / 1000);
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Newest first; at the same millisecond by author, then the newer id first. */
function compareNewest(a: SocialPost, b: SocialPost): number {
  return b.createdAtMs - a.createdAtMs || compareText(a.author, b.author) || compareText(b.postId, a.postId);
}

function push<V>(map: Map<string, V[]>, key: string, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

/** The newest live version of each post of the author, skipped when that version has no data. */
function postsOf({ author, activity }: AuthorRecords): SocialPost[] {
  const newest = new Map<string, { editId: string; record: RecordEntry<SocialData> }>();
  for (const [path, record] of activity) {
    const at = locate(author, path);
    if (at === null || at.kind !== 'post' || at.editId === undefined) continue;
    const current = newest.get(at.id);
    if (current === undefined || at.editId > current.editId) newest.set(at.id, { editId: at.editId, record });
  }
  const posts: SocialPost[] = [];
  for (const [postId, { editId, record }] of newest) {
    if (record.data?.type !== 'post') continue;
    const createdAtMs = msOf(postId);
    const editedAtMs = editId === postId ? null : msOf(editId);
    posts.push({ author, postId, editId, createdAtMs, editedAtMs, data: record.data });
  }
  return posts.sort(compareNewest);
}

/** Labels by number of taggers, most first, then by label. */
function groupTags(taggersByLabel: ReadonlyMap<string, ReadonlySet<string>> | undefined): TagGroup[] {
  if (taggersByLabel === undefined) return [];
  return [...taggersByLabel]
    .map(([label, taggers]) => ({ label, taggers: [...taggers].sort(compareText) }))
    .sort((a, b) => b.taggers.length - a.taggers.length || compareText(a.label, b.label));
}

export function buildSocialView(records: Iterable<AuthorRecords>): SocialView {
  const hops = new Map<string, number | null>();
  const profiles = new Map<string, UserData>();
  const followingOf = new Map<string, string[]>();
  const followersOf = new Map<string, string[]>();
  const posts = new Map<string, SocialPost>();
  const postsByAuthor = new Map<string, SocialPost[]>();
  const replies = new Map<string, SocialPost[]>();
  const reposts = new Map<string, SocialPost[]>();
  const mentions = new Map<string, SocialPost[]>();
  const collections = new Map<string, SocialPost[]>();
  const given = new Map<string, TagData[]>();
  const tagsOn = new Map<string, Map<string, Set<string>>>();

  for (const entry of records) {
    const { author } = entry;
    hops.set(author, entry.hop);
    const following: string[] = [];
    for (const [path, record] of entry.graph) {
      if (path === PROFILE_PATH && record.data?.type === 'user') profiles.set(author, record.data);
      const followee = followeeOfPath(path);
      if (followee !== null) following.push(followee);
    }
    followingOf.set(author, following.sort(compareText));
    for (const followee of following) push(followersOf, followee, author);

    postsByAuthor.set(author, postsOf(entry));

    for (const record of entry.activity.values()) {
      if (record.data?.type !== 'tag') continue;
      push(given, author, record.data);
      const key = targetKey(record.data.target);
      if (key === null) continue;
      const byLabel = tagsOn.get(key) ?? new Map<string, Set<string>>();
      tagsOn.set(key, byLabel);
      const taggers = byLabel.get(record.data.label) ?? new Set<string>();
      byLabel.set(record.data.label, taggers.add(author));
    }
  }

  const allPosts = [...postsByAuthor.values()].flatMap((list) => list).sort(compareNewest);
  for (const post of allPosts) {
    posts.set(postKey(post.author, post.postId), post);
    const { parent, embed, items } = post.data;
    const parentKey = parent === null ? null : targetKey(parent);
    if (parentKey !== null) push(replies, parentKey, post);
    const embedKey = embed === null ? null : targetKey(embed);
    if (embedKey !== null) push(reposts, embedKey, post);
    for (const user of post.data.mentions) push(mentions, user, post);
    const itemKeys = new Set((items ?? []).map(({ target }) => targetKey(target)));
    for (const key of itemKeys) if (key !== null) push(collections, key, post);
  }
  for (const followers of followersOf.values()) followers.sort(compareText);
  for (const tags of given.values()) tags.sort((a, b) => compareText(a.label, b.label) || compareText(a.uri, b.uri));

  const authors = Object.freeze([...hops.keys()]);
  const following = (user: string): readonly string[] => followingOf.get(user) ?? NONE;
  const followers = (user: string): readonly string[] => followersOf.get(user) ?? NONE;
  const friends = (user: string): string[] => {
    const back = new Set(followers(user));
    return following(user).filter((followee) => back.has(followee));
  };
  const postsBy = (author: string): readonly SocialPost[] => postsByAuthor.get(author) ?? NONE;
  const isReply = (post: SocialPost) => post.data.parent !== null;
  const tagsOnPost = (author: string, postId: string) => groupTags(tagsOn.get(postKey(author, postId)));
  const tagsOnUser = (user: string) => groupTags(tagsOn.get(userKey(user)));
  const taggings = (groups: readonly TagGroup[]) => groups.reduce((sum, group) => sum + group.taggers.length, 0);

  return {
    authors,
    hopOf: (user) => hops.get(user) ?? null,
    profile: (user) => profiles.get(user) ?? null,
    following,
    followers,
    friends,
    post: (author, postId) => posts.get(postKey(author, postId)) ?? null,
    postsBy,
    rootPostsBy: (author) => postsBy(author).filter((post) => !isReply(post)),
    repliesBy: (author) => postsBy(author).filter(isReply),
    repliesTo: (author, postId) => replies.get(postKey(author, postId)) ?? NONE,
    repostsOf: (author, postId) => reposts.get(postKey(author, postId)) ?? NONE,
    mentionsOf: (user) => mentions.get(user) ?? NONE,
    tagsOnPost,
    tagsOnUser,
    tagsBy: (user) => given.get(user) ?? NONE,
    collectionsContaining: (author, postId) => collections.get(postKey(author, postId)) ?? NONE,
    postCounts: (author, postId) => {
      const tags = tagsOnPost(author, postId);
      return {
        replies: (replies.get(postKey(author, postId)) ?? NONE).length,
        reposts: (reposts.get(postKey(author, postId)) ?? NONE).length,
        tags: taggings(tags),
        uniqueTags: tags.length,
      };
    },
    userCounts: (user) => {
      const all = postsBy(user);
      return {
        posts: all.length,
        replies: all.filter(isReply).length,
        following: following(user).length,
        followers: followers(user).length,
        friends: friends(user).length,
        tagsGiven: (given.get(user) ?? NONE).length,
        tagged: taggings(tagsOnUser(user)),
      };
    },
    timeline: (from, options = {}) => {
      const kinds = options.kinds === undefined ? null : new Set<string>(options.kinds);
      return [...new Set(from)]
        .flatMap((author) => postsBy(author))
        .filter((post) => (options.includeReplies ?? false) || !isReply(post))
        .filter((post) => kinds === null || kinds.has(post.data.kind))
        .sort(compareNewest);
    },
  };
}

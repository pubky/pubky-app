import type { KnownPostKind } from 'pubky-social-specs';
import type { Cursor } from '../indexer.types';
import {
  type AuthorPart,
  authorPartOf,
  compareNewest,
  compareText,
  type EdgeKind,
  NONE,
  postKey,
  userKey,
} from './social.author';
import { type AuthorChange, combine, type Combined, patchCombined } from './social.combine';
import type { AuthorRecords, Membership, PostData, TagData, UserData } from './social.types';
import { buildTimeTable, estimateMs, type TimeSample } from './timeTable';

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

/** A tag with the estimated time it was written, `null` when unknown. */
export interface SocialTag extends TagData {
  atMs: number | null;
}

/** How much of an author's history is loaded. */
export interface History {
  /** Whether it reaches back to the author's first event. */
  complete: boolean;
  /** The estimated time from which it is loaded, `null` when complete or unknown. */
  sinceMs: number | null;
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
 * What the records in view say. Reverse edges and the counts built on them come from members' records alone, so
 * loading a user or a post on demand changes no answer about the scope; a visited author serves their own
 * records, a post loaded alone is resolvable by key. Lists of posts are newest first.
 */
export interface SocialView {
  /** The scope's members, in the order of the records: the users every network-wide answer ranges over. */
  readonly authors: readonly string[];
  /** `null` for a user nothing is loaded of. */
  membershipOf(user: string): Membership | null;
  hopOf(user: string): number | null;
  profile(user: string): UserData | null;
  /** Every user the user follows, in scope or not. */
  following(user: string): readonly string[];
  /** The members who follow the user. */
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
  tagsBy(user: string): readonly SocialTag[];
  collectionsContaining(author: string, postId: string): readonly SocialPost[];
  postCounts(author: string, postId: string): PostCounts;
  userCounts(user: string): UserCounts;
  /** The authors' posts merged, newest first. */
  timeline(authors: Iterable<string>, options?: TimelineOptions): SocialPost[];
  /**
   * The estimated time of an event of the author's homeserver, from the posts written there; `null` when that
   * homeserver has no post. The same records give the same estimate on any device.
   */
  timeOf(author: string, cursor: Cursor): number | null;
  /** Unknown for an author whose own records are not loaded. */
  historyOf(author: string, group?: 'graph' | 'activity'): History;
  /** Whether tombstones prove every version of the post deleted. */
  postDeleted(author: string, postId: string): boolean;
  /** Whether a tombstone proves the profile deleted. */
  profileDeleted(user: string): boolean;
  /** The estimated time of the profile's last write. */
  profileAtMs(user: string): number | null;
  /** The estimated time `follower` followed `followee`, `null` when unknown or not following. */
  followedAtMs(follower: string, followee: string): number | null;
}

/**
 * The view with what it is built from, to update when records change. Its answers never change once built: an update
 * makes a new state and copies whatever it changes.
 */
export interface SocialState {
  readonly view: SocialView;
  /** By author, in the order the records came. */
  readonly parts: ReadonlyMap<string, AuthorPart>;
  readonly combined: Combined;
  /** Each homeserver's time table, built on first use. */
  readonly tables: Map<string, readonly TimeSample[]>;
}

/** Labels by number of taggers, most first, then by label. */
function groupTags(taggersByLabel: ReadonlyMap<string, ReadonlySet<string>> | undefined): TagGroup[] {
  if (taggersByLabel === undefined) return [];
  return [...taggersByLabel]
    .map(([label, taggers]) => ({ label, taggers: [...taggers].sort(compareText) }))
    .sort((a, b) => b.taggers.length - a.taggers.length || compareText(a.label, b.label));
}

function stateOf(
  parts: ReadonlyMap<string, AuthorPart>,
  combined: Combined,
  tables: Map<string, readonly TimeSample[]>,
): SocialState {
  const { followers: followersOf, tagsOn, edges } = combined;
  const tableOf = (homeserver: string): readonly TimeSample[] => {
    const known = tables.get(homeserver);
    if (known !== undefined) return known;
    const samples: TimeSample[] = [];
    for (const part of parts.values()) {
      if (part.records.homeserver === homeserver) for (const sample of part.samples) samples.push(sample);
    }
    const table = buildTimeTable(samples);
    tables.set(homeserver, table);
    return table;
  };
  const timeOf = (author: string, cursor: Cursor): number | null => {
    const part = parts.get(author);
    return part === undefined ? null : estimateMs(tableOf(part.records.homeserver), cursor);
  };
  /** Tags with their times, made on first use: the times depend on every author of the homeserver. */
  const given = new Map<string, readonly SocialTag[]>();
  const tagsBy = (user: string): readonly SocialTag[] => {
    const known = given.get(user);
    if (known !== undefined) return known;
    const tags = parts.get(user)?.tags ?? NONE;
    const dated = tags.length === 0 ? NONE : tags.map(({ data, cursor }) => ({ ...data, atMs: timeOf(user, cursor) }));
    given.set(user, dated);
    return dated;
  };

  const authors = Object.freeze(
    [...parts.values()].filter(({ records }) => records.membership === 'member').map(({ records }) => records.author),
  );
  const following = (user: string): readonly string[] => parts.get(user)?.following ?? NONE;
  const followers = (user: string): readonly string[] => followersOf.get(user) ?? NONE;
  const friends = (user: string): string[] => {
    const back = new Set(followers(user));
    return following(user).filter((followee) => back.has(followee));
  };
  const postsBy = (author: string): readonly SocialPost[] => parts.get(author)?.posts ?? NONE;
  const isReply = (post: SocialPost) => post.data.parent !== null;
  const listOf = (kind: EdgeKind, key: string): readonly SocialPost[] => edges[kind].get(key) ?? NONE;
  const tagsOnPost = (author: string, postId: string) => groupTags(tagsOn.get(postKey(author, postId)));
  const tagsOnUser = (user: string) => groupTags(tagsOn.get(userKey(user)));
  const taggings = (groups: readonly TagGroup[]) => groups.reduce((sum, group) => sum + group.taggers.length, 0);

  const view: SocialView = {
    authors,
    membershipOf: (user) => parts.get(user)?.records.membership ?? null,
    hopOf: (user) => parts.get(user)?.records.hop ?? null,
    profile: (user) => parts.get(user)?.profile ?? null,
    following,
    followers,
    friends,
    post: (author, postId) => parts.get(author)?.byId.get(postId) ?? null,
    postsBy,
    rootPostsBy: (author) => postsBy(author).filter((post) => !isReply(post)),
    repliesBy: (author) => postsBy(author).filter(isReply),
    repliesTo: (author, postId) => listOf('replies', postKey(author, postId)),
    repostsOf: (author, postId) => listOf('reposts', postKey(author, postId)),
    mentionsOf: (user) => listOf('mentions', user),
    tagsOnPost,
    tagsOnUser,
    tagsBy,
    collectionsContaining: (author, postId) => listOf('collections', postKey(author, postId)),
    postCounts: (author, postId) => {
      const tags = tagsOnPost(author, postId);
      return {
        replies: listOf('replies', postKey(author, postId)).length,
        reposts: listOf('reposts', postKey(author, postId)).length,
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
        tagsGiven: tagsBy(user).length,
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
    timeOf,
    historyOf: (author, group = 'activity') => {
      const records = parts.get(author)?.records;
      const history = records === undefined || records.membership === 'referenced' ? undefined : records.history[group];
      if (history === undefined) return { complete: false, sinceMs: null };
      const { complete, tail } = history;
      return { complete, sinceMs: complete || tail === null ? null : timeOf(author, tail) };
    },
    postDeleted: (author, postId) => parts.get(author)?.records.deleted?.posts.has(postId) ?? false,
    profileDeleted: (user) => parts.get(user)?.records.deleted?.profile ?? false,
    profileAtMs: (user) => {
      const cursor = parts.get(user)?.profileCursor ?? null;
      return cursor === null ? null : timeOf(user, cursor);
    },
    followedAtMs: (follower, followee) => {
      const cursor = parts.get(follower)?.followCursors.get(followee);
      return cursor === undefined ? null : timeOf(follower, cursor);
    },
  };
  return { view, parts, combined, tables };
}

/** Each author's part, a later entry of an author replacing an earlier one; `previous` lends its unchanged parts. */
function partsOf(records: Iterable<AuthorRecords>, previous: SocialState | null): Map<string, AuthorPart> {
  const parts = new Map<string, AuthorPart>();
  for (const entry of records) {
    const known = previous?.parts.get(entry.author);
    parts.set(entry.author, known !== undefined && known.records === entry ? known : authorPartOf(entry));
  }
  return parts;
}

/** The view of the records, built from scratch. Records name each author once; a later entry replaces an earlier one. */
export function buildSocialState(records: Iterable<AuthorRecords>): SocialState {
  const parts = partsOf(records, null);
  return stateOf(parts, combine(parts.values()), new Map());
}

export function buildSocialView(records: Iterable<AuthorRecords>): SocialView {
  return buildSocialState(records).view;
}

const sameSamples = (a: AuthorPart | undefined, b: AuthorPart | undefined): boolean =>
  a !== undefined &&
  b !== undefined &&
  a.records.homeserver === b.records.homeserver &&
  a.samples.length === b.samples.length &&
  a.samples.every(({ cursor, ms }, i) => cursor === b.samples[i].cursor && ms === b.samples[i].ms);

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The state of the records, from `previous` and the authors whose records changed: an author whose `AuthorRecords`
 * is the same object as in `previous` is unchanged, so callers hand over the same object for unchanged records and
 * never mutate one. Answers exactly as `buildSocialState(records)`.
 */
export function updateSocialState(previous: SocialState, records: Iterable<AuthorRecords>): SocialState {
  const parts = partsOf(records, previous);
  const changes: AuthorChange[] = [];
  for (const [author, after] of parts) {
    const before = previous.parts.get(author);
    if (before !== after) changes.push({ before, after });
  }
  for (const [author, before] of previous.parts) if (!parts.has(author)) changes.push({ before, after: undefined });
  const members = [...parts.values()].filter(({ records }) => records.membership === 'member');
  if (
    changes.length === 0 &&
    sameList(
      previous.view.authors,
      members.map(({ records }) => records.author),
    )
  ) {
    return previous;
  }
  // A table stays valid while no author of its homeserver changed a sample.
  const stale = new Set<string>();
  for (const { before, after } of changes) {
    if (sameSamples(before, after)) continue;
    if (before !== undefined) stale.add(before.records.homeserver);
    if (after !== undefined) stale.add(after.records.homeserver);
  }
  const tables = new Map([...previous.tables].filter(([homeserver]) => !stale.has(homeserver)));
  // Past about an eighth of the authors, combining everyone again costs less than patching.
  const combined =
    changes.length * 8 > parts.size ? combine(parts.values()) : patchCombined(previous.combined, changes);
  return stateOf(parts, combined, tables);
}

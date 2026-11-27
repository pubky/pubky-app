/**
 * How far an answer can be trusted. `exact`: a global index would say the same. `scope`: correct for what the
 * crawled scope saw, which is all a reverse edge, a count or a ranking can be from here.
 */
export interface Coverage {
  kind: 'exact' | 'scope';
  note?: string;
}

/**
 * What the caller can load to extend an answer and ask again: an author's older activity, one post, one user's
 * records, or what lies at one path of an author's tree.
 */
export type MoreHint =
  | { kind: 'backfill'; author: string }
  | { kind: 'post'; author: string; postId: string }
  | { kind: 'user'; user: string }
  | { kind: 'file'; author: string; path: string };

export interface Answer<T> {
  data: T;
  coverage: Coverage;
  /** Present only when something not loaded would extend the answer. */
  more?: MoreHint[];
}

export interface QueryContext {
  /** The signed-in user the scope was crawled from, `null` for a visitor: then there is no scope. */
  seed: string | null;
  now: () => number;
  /** The first scope sync of this run has not settled, or files of stored records are still to be fetched. */
  syncing?: boolean;
}

export const exact = <T>(data: T, note?: string): Answer<T> => ({
  data,
  coverage: note === undefined ? { kind: 'exact' } : { kind: 'exact', note },
});

export const scoped = <T>(data: T, note?: string): Answer<T> => ({
  data,
  coverage: note === undefined ? { kind: 'scope' } : { kind: 'scope', note },
});

/** The answer with the hints attached, unchanged when there are none. */
export const withMore = <T>(answer: Answer<T>, more: readonly MoreHint[]): Answer<T> =>
  more.length === 0 ? answer : { ...answer, more: [...more] };

/** Notes joined into one, `undefined` when there are none. */
export function noteOf(...notes: (string | null)[]): string | undefined {
  const kept = notes.filter((note): note is string => note !== null);
  return kept.length === 0 ? undefined : kept.join('; ');
}

/** A time for a coverage note. */
export function isoOf(ms: number | null): string {
  if (ms === null) return 'an unknown time';
  // A `Date` holds 8.64e15 ms either side of the epoch.
  return Math.abs(ms) <= 8.64e15 ? new Date(ms).toISOString() : `${ms} ms`;
}

// The JSON the central indexer's `/v1` API serves, field for field, so the app parses an answer unchanged.

export interface PostDetailsJson {
  content: string;
  id: string;
  /** The post's creation time from its id, in milliseconds: the local index has no ingest clock. */
  indexed_at: number;
  author: string;
  kind: string;
  uri: string;
  attachments: string[];
  lock: string | null;
  deleted: boolean;
}

export interface PostCountsJson {
  tags: number;
  unique_tags: number;
  replies: number;
  reposts: number;
  collections: number;
}

export interface TagDetailsJson {
  label: string;
  taggers: string[];
  taggers_count: number;
  /** The viewer's own tag file for this label, `null` when the viewer did not tag it. */
  tag_uri: string | null;
}

export interface PostRelationshipsJson {
  replied: string | null;
  reposted: string | null;
  mentioned: string[];
}

export interface PostViewJson {
  details: PostDetailsJson;
  counts: PostCountsJson;
  tags: TagDetailsJson[];
  relationships: PostRelationshipsJson;
}

export interface PostKeyStreamJson {
  /** `{author}:{postId}`. */
  post_keys: string[];
  last_post_score: number | null;
}

export interface TaggersJson {
  users: string[];
  tag_uri: string | null;
}

export interface UserLinkJson {
  title: string;
  url: string;
}

export interface UserDetailsJson {
  name: string;
  bio: string | null;
  id: string;
  links: UserLinkJson[];
  status: string | null;
  image: string | null;
  indexed_at: number;
  deleted: boolean;
  epoch: string;
}

export interface UserCountsJson {
  /** Tags the user put on others. */
  tagged: number;
  /** Tags others put on the user. */
  tags: number;
  unique_tags: number;
  /** Replies included. */
  posts: number;
  replies: number;
  collections: number;
  following: number;
  followers: number;
  friends: number;
}

export interface UserViewJson {
  details: UserDetailsJson;
  counts: UserCountsJson;
  tags: TagDetailsJson[];
  relationship: { following: boolean; followed_by: boolean };
  /** Needs the global trust ranking. */
  social_graph_status: null;
}

export interface HotTagJson {
  label: string;
  taggers_id: string[];
  tagged_count: number;
  taggers_count: number;
}

export interface UserTagSearchJson {
  user_id: string;
  score: number;
}

export type NotificationBodyJson =
  | { type: 'follow'; followed_by: string }
  | { type: 'new_friend'; followed_by: string }
  | { type: 'reply'; replied_by: string; parent_post_uri: string; reply_uri: string; post_kind: string }
  | { type: 'repost'; reposted_by: string; embed_uri: string; repost_uri: string; post_kind: string }
  | { type: 'mention'; mentioned_by: string; post_uri: string; post_kind: string }
  | { type: 'tag_post'; tagged_by: string; tag_label: string; post_uri: string; post_kind: string }
  | { type: 'tag_profile'; tagged_by: string; tag_label: string };

/** A follow, tag or profile time is estimated from the homeserver's event order; 0 when unknown. */
export interface NotificationJson {
  timestamp: number;
  body: NotificationBodyJson;
}

export interface BootstrapJson {
  users: UserViewJson[];
  posts: PostViewJson[];
  ids: { stream: string[]; influencers: string[]; recommended: string[]; hot_tags: HotTagJson[] };
  indexed: boolean;
  notifications: NotificationJson[];
}

/**
 * A file record, as the central indexer's file details serve it. `urls` is JSON text there too; `metadata` holds
 * measured dimensions, which the local index never measures.
 */
export interface FileDetailsJson {
  id: string;
  uri: string;
  owner_id: string;
  /** The record's creation time from its id, in milliseconds: the local index has no ingest clock. */
  indexed_at: number;
  created_at: number;
  src: string;
  name: string;
  size: number;
  content_type: string;
  urls: string;
  metadata: Record<string, string> | null;
}

export interface IngestJson {
  in_scope: boolean;
}

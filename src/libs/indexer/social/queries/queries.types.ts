/**
 * How far an answer can be trusted. `exact`: a global index would say the same. `scope`: correct for what the
 * crawled scope saw, which is all a reverse edge, a count or a ranking can be from here.
 */
export interface Coverage {
  kind: 'exact' | 'scope';
  note?: string;
}

export interface Answer<T> {
  data: T;
  coverage: Coverage;
}

export interface QueryContext {
  /** The signed-in user the scope was crawled from. */
  seed: string;
  now: () => number;
}

export const exact = <T>(data: T, note?: string): Answer<T> => ({
  data,
  coverage: note === undefined ? { kind: 'exact' } : { kind: 'exact', note },
});

export const scoped = <T>(data: T, note?: string): Answer<T> => ({
  data,
  coverage: note === undefined ? { kind: 'scope' } : { kind: 'scope', note },
});

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
  | { type: 'reply'; replied_by: string; parent_post_uri: string; reply_uri: string; post_kind: string }
  | { type: 'repost'; reposted_by: string; embed_uri: string; repost_uri: string; post_kind: string }
  | { type: 'mention'; mentioned_by: string; post_uri: string; post_kind: string }
  | { type: 'tag_post'; tagged_by: string; tag_label: string; post_uri: string; post_kind: string }
  | { type: 'tag_profile'; tagged_by: string; tag_label: string };

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

export interface IngestJson {
  in_scope: boolean;
}

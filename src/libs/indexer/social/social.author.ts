import { idMicros } from 'pubky-social-specs';
import type { Cursor, RecordEntry } from '../indexer.types';
import { socialV1Tree } from './social.domain';
import type { AuthorRecords, SocialData, SocialTarget, SocialTree, TagData, UserData } from './social.types';
import type { SocialFile, SocialPost } from './social.view';
import type { TimeSample } from './timeTable';

export const NONE: readonly never[] = Object.freeze([]);
const NO_RECORDS: ReadonlyMap<string, RecordEntry<SocialData>> = new Map();

export const postKey = (author: string, postId: string) => `${author}/${postId}`;
export const userKey = (user: string) => `user/${user}`;

/** The key of what a target names, `null` for a target outside the social tree. */
export function targetKey(target: SocialTarget): string | null {
  if (target.kind === 'post') return postKey(target.author, target.postId);
  if (target.kind === 'user') return userKey(target.author);
  return null;
}

const msOf = (id: string) => Math.floor(idMicros(id) / 1000);
export const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Newest first; at the same millisecond by author, then the newer id first. */
export function compareNewest(a: SocialPost, b: SocialPost): number {
  return b.createdAtMs - a.createdAtMs || compareText(a.author, b.author) || compareText(b.postId, a.postId);
}

/** The reverse edges a post makes. */
export type EdgeKind = 'replies' | 'reposts' | 'mentions' | 'collections';

/** Calls `edge` for each reverse edge of the post: a key once per edge, a mention once per time it is listed. */
export function forEachEdge(post: SocialPost, edge: (kind: EdgeKind, key: string) => void): void {
  const { parent, embed, items, mentions } = post.data;
  const parentKey = parent === null ? null : targetKey(parent);
  if (parentKey !== null) edge('replies', parentKey);
  const embedKey = embed === null ? null : targetKey(embed);
  if (embedKey !== null) edge('reposts', embedKey);
  for (const user of mentions) edge('mentions', user);
  const itemKeys = new Set((items ?? []).map(({ target }) => targetKey(target)));
  for (const key of itemKeys) if (key !== null) edge('collections', key);
}

/** A tag the author wrote, with the cursor that dates it. */
export interface AuthoredTag {
  data: TagData;
  cursor: Cursor;
}

/** Everything derived from one author's own records alone; reverse edges and times are combined over all authors. */
export interface AuthorPart {
  /** What the part is derived from: the same object, never mutated, derives the same part. */
  readonly records: AuthorRecords;
  readonly profile: UserData | null;
  readonly profileCursor: Cursor | null;
  /** Sorted; empty for a referenced author. */
  readonly following: readonly string[];
  readonly followCursors: ReadonlyMap<string, Cursor>;
  /** The author's stream, newest first; empty for a referenced author. */
  readonly posts: readonly SocialPost[];
  /** By post id: the stream's posts over the ones loaded alone. */
  readonly byId: ReadonlyMap<string, SocialPost>;
  /** By label, then URI; empty for a referenced author. */
  readonly tags: readonly AuthoredTag[];
  /** Every post version the author's homeserver table learns from. */
  readonly samples: readonly TimeSample[];
  /** File records by path: the stream's over the ones loaded alone. */
  readonly files: ReadonlyMap<string, SocialFile>;
}

/** The newest live version of each post of the author, skipped when that version has no data. */
function postsOf(
  tree: SocialTree,
  author: string,
  records: ReadonlyMap<string, RecordEntry<SocialData>>,
): SocialPost[] {
  const newest = new Map<string, { editId: string; record: RecordEntry<SocialData> }>();
  for (const [path, record] of records) {
    const key = tree.keyOf(author, path);
    if (key === null || key.kind !== 'post') continue;
    const current = newest.get(key.postId);
    if (current === undefined || key.editId > current.editId) newest.set(key.postId, { editId: key.editId, record });
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

function filesInto(
  tree: SocialTree,
  author: string,
  records: ReadonlyMap<string, RecordEntry<SocialData>>,
  into: Map<string, SocialFile>,
): void {
  for (const [path, record] of records) {
    const key = tree.keyOf(author, path);
    if (key?.kind === 'file' && record.data?.type === 'file') {
      into.set(path, { author, path, fileId: key.fileId, data: record.data });
    }
  }
}

/** Every post version is a sample: its edit id holds the time it was written. */
function samplesOf(
  tree: SocialTree,
  author: string,
  records: ReadonlyMap<string, RecordEntry<SocialData>>,
  into: TimeSample[],
): void {
  for (const [path, record] of records) {
    const key = tree.keyOf(author, path);
    if (key !== null && key.kind === 'post') into.push({ cursor: record.cursor, ms: msOf(key.editId) });
  }
}

export function authorPartOf(records: AuthorRecords): AuthorPart {
  const { author, membership } = records;
  const tree = records.tree ?? socialV1Tree;
  const loose = records.loose ?? NO_RECORDS;
  const stored = records.graph.get(tree.profilePath);
  const profile = stored?.data?.type === 'user' ? stored.data : null;
  const byId = new Map<string, SocialPost>();
  // A post in an author's stream wins over the same post loaded alone.
  for (const post of postsOf(tree, author, loose)) byId.set(post.postId, post);
  const samples: TimeSample[] = [];
  const files = new Map<string, SocialFile>();
  filesInto(tree, author, loose, files);
  const base = {
    records,
    profile,
    profileCursor: profile === null || stored === undefined ? null : stored.cursor,
    byId,
    samples,
    files,
  };
  if (membership === 'referenced') {
    samplesOf(tree, author, loose, samples);
    return { ...base, following: NONE, followCursors: new Map(), posts: NONE, tags: NONE };
  }
  samplesOf(tree, author, records.activity, samples);
  samplesOf(tree, author, loose, samples);
  filesInto(tree, author, records.activity, files);
  const following: string[] = [];
  const followCursors = new Map<string, Cursor>();
  for (const [path, record] of records.graph) {
    const followee = tree.followeeOf(path);
    if (followee === null) continue;
    following.push(followee);
    followCursors.set(followee, record.cursor);
  }
  const posts = postsOf(tree, author, records.activity);
  for (const post of posts) byId.set(post.postId, post);
  const tags: AuthoredTag[] = [];
  for (const record of records.activity.values()) {
    if (record.data?.type === 'tag') tags.push({ data: record.data, cursor: record.cursor });
  }
  tags.sort((a, b) => compareText(a.data.label, b.data.label) || compareText(a.data.uri, b.data.uri));
  return { ...base, following: following.sort(compareText), followCursors, posts, tags };
}

import type { KnownPostKind } from 'pubky-social-specs';
import type { BodyNeed } from '../domain.types';
import type { Cursor, RecordEntry } from '../indexer.types';

/** What a reference points at: a post, a user, or anything outside the social tree, kept as written. */
export type SocialTarget =
  { kind: 'post'; author: string; postId: string } | { kind: 'user'; author: string } | { kind: 'other'; uri: string };

export interface UserLinkData {
  title: string;
  url: string;
}

/** A profile. */
export interface UserData {
  type: 'user';
  name: string;
  bio: string | null;
  /** The avatar reference. */
  image: string | null;
  links: UserLinkData[];
  status: string | null;
}

export interface AttachmentData {
  uri: string;
  name: string | null;
}

export interface CollectionItemData {
  target: SocialTarget;
  note: string | null;
}

/** One version of a post. */
export interface PostData {
  type: 'post';
  postId: string;
  editId: string;
  kind: KnownPostKind;
  /** The full text: a note's content, an article's body, a collection's description or empty. */
  content: string;
  parent: SocialTarget | null;
  embed: SocialTarget | null;
  /** Keys of the users mentioned in `content`, each once, in order of appearance. */
  mentions: string[];
  attachments: AttachmentData[];
  /** A reference to what gates the post. */
  lock: string | null;
  /** An article's title or a collection's name. */
  title?: string;
  coverImage?: string | null;
  /** A collection's entries, in the curator's order. */
  items?: CollectionItemData[];
  /** How a collection's creator would lay it out. */
  layout?: string | null;
}

/** A label on a target. */
export interface TagData {
  type: 'tag';
  /** The target's canonical URI, or the raw one outside the social tree. */
  uri: string;
  target: SocialTarget;
  label: string;
}

/** A file's description, in a tree that keeps one beside the bytes. */
export interface FileData {
  type: 'file';
  name: string;
  contentType: string;
  /** In bytes. */
  size: number;
  /** The bytes, a file of the same owner. */
  src: string;
  /** As the record states it. */
  createdAt: number;
}

/** The payload of a social record. Follows carry none: the path says everything. */
export type SocialData = UserData | PostData | TagData | FileData;

/** What a record is in its author's tree, whichever tree's path spells it. */
export type SocialRecordKey =
  | { kind: 'profile' }
  | { kind: 'follow'; followee: string }
  | { kind: 'post'; postId: string; editId: string }
  | { kind: 'tag' }
  | { kind: 'file'; fileId: string };

/**
 * One layout of the social records on a homeserver: where they live and how its files read into the shapes above.
 * Two trees never share a path, and the data of either names posts and users by author and id, so references
 * resolve across trees.
 */
export interface SocialTree {
  /** Names the tree in the ids of the groups that read it beside another. */
  id: string;
  /** Path prefixes of the follows and the profile, read in full. */
  graphPaths: readonly string[];
  /** Path prefixes of the posts and tags, read within the window. */
  activityPaths: readonly string[];
  profilePath: string;
  /** The path prefix of every version of one post. */
  postPath(postId: string): string;
  /** Whether the path lies in the tree. */
  owns(path: string): boolean;
  /** The followee of a follow path, `null` for any other path. */
  followeeOf(path: string): string | null;
  /** What the path names, `null` for a path of no record the tree reads. */
  keyOf(author: string, path: string): SocialRecordKey | null;
  /** When the record's file is fetched: posts, profiles and file records to render, tags later. */
  needsBody(path: string): BodyNeed | null;
  /** Reads a fetched file, `null` when it is invalid. May throw on any input. */
  reduce(author: string, path: string, bytes: Uint8Array): SocialData | null;
  /** The payload when it is exactly what `reduce` makes for the path, else `null`. */
  reviveData(author: string, path: string, value: unknown): SocialData | null;
  /** When the write at the path happened, in microseconds, when the path says so, else `null`. */
  timeOfPath(path: string): bigint | null;
}

/** How much of one group's history is loaded: the trusted range of its merged runs. */
export interface GroupHistory {
  /** Whether the trusted range reaches back to the start of the author's event stream. */
  complete: boolean;
  /** The trusted range's tail cursor, `null` without coverage. */
  tail: Cursor | null;
}

/**
 * How an author entered the view. `member`: in the seed's scope; only members' records make reverse edges, counts
 * and network-wide answers. `visited`: loaded one by one, served with their own records and history, outside the
 * scope. `referenced`: known only through posts loaded one at a time, and their profile when it is stored.
 */
export type Membership = 'member' | 'visited' | 'referenced';

/** What tombstones inside trusted ranges prove deleted. */
export interface Deletions {
  /** Posts whose every version is deleted. */
  posts: ReadonlySet<string>;
  profile: boolean;
}

/** One author's served records: the `live` maps of the merged runs of its scopes. */
export interface AuthorRecords {
  author: string;
  /** The homeserver the records were read from: it scopes their cursors. */
  homeserver: string;
  membership: Membership;
  /** Link distance from the seed, `null` when unknown. */
  hop: number | null;
  /** Only the profile counts for a `referenced` author. */
  graph: ReadonlyMap<string, RecordEntry<SocialData>>;
  /** Ignored for a `referenced` author. */
  activity: ReadonlyMap<string, RecordEntry<SocialData>>;
  /** Versions of posts loaded one at a time: resolvable by key, never in the author's stream nor in any edge. */
  loose?: ReadonlyMap<string, RecordEntry<SocialData>>;
  deleted?: Deletions;
  history: { graph: GroupHistory; activity: GroupHistory };
  /** The tree the records were read from, social v1 when absent. Every path of the maps above is one of its own. */
  tree?: SocialTree;
}

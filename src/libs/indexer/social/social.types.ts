import type { KnownPostKind } from 'pubky-social-specs';
import type { RecordEntry } from '../indexer.types';

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

/** The payload of a social record. Follows carry none: the path says everything. */
export type SocialData = UserData | PostData | TagData;

/** One author's served records: the `live` maps of the merged runs of its two scopes. */
export interface AuthorRecords {
  author: string;
  /** The homeserver the records were read from: it scopes their cursors. */
  homeserver: string;
  /** Link distance from the seed, `null` when unknown. */
  hop: number | null;
  graph: ReadonlyMap<string, RecordEntry<SocialData>>;
  activity: ReadonlyMap<string, RecordEntry<SocialData>>;
}

import type { TagKind } from '@/application/tag/tag.types';
import type { Pubky } from '@/models/models.types';

export interface TTagEventParams {
  taggerId: Pubky | string;
  taggedId: Pubky;
  label: string;
  taggedKind: TagKind;
}

export interface TTagFromResponse {
  taggerId: Pubky;
  taggedId: Pubky;
  /** The label as `pubky-social-specs` stores it: trimmed and ASCII-lowercased. */
  label: string;
  taggedKind: TagKind;
  tagUrl: string;
  /** The exact bytes to PUT at `tagUrl`. */
  tagBody: Uint8Array;
}

/** The viewer's tag on an external resource: a web link (or any URI that is no Pubky object). */
export interface TResourceTagEventParams {
  taggerId: Pubky;
  /** The link exactly as written: the tag's `uri`, and what Nexus matches. */
  uri: string;
  label: string;
}

export interface TDeleteResourceTagParams extends TResourceTagEventParams {
  /** The viewer's tag file as Nexus reports it (`tag_uri`), when known. */
  tagUri?: string | null;
  /** Other spellings of `uri` whose tags are shown as its own: the viewer's tag goes on each that holds it. */
  spellings?: readonly string[];
}

export interface TFetchResourceTagsParams {
  uri: string;
  viewerId?: Pubky | null;
  /**
   * Other spellings of the same link (Pinakes' refs and aliases of its card), read along: their tags
   * are merged into the link's (`mergeResourceTags`).
   */
  spellings?: readonly string[];
  /**
   * Read the spellings one `by-uri` each on a Nexus without `by_ids` (the resource page); else they
   * are read only in a `by_ids` batch, so a feed card sends no request per spelling.
   */
  spellingsByUri?: boolean;
  /**
   * Read the link only in the `by_ids` batch, with the links asked at the same moment (another link of
   * a card in a feed): where the batch cannot answer it nothing else is asked and it has no tags, so a
   * feed card sends no request per link.
   */
  byIdsOnly?: boolean;
}

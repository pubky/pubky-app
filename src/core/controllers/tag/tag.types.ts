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
}

export interface TFetchResourceTagsParams {
  uri: string;
  viewerId?: Pubky | null;
}

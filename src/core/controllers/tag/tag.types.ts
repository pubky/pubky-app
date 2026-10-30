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

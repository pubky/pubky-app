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
  label: string;
  taggedKind: TagKind;
  tagUrl: string;
  tagJson: Record<string, unknown>;
}

import type { TTagEventParams } from '@/controllers/tag/tag.types';

export type TLocalTagParams = Omit<TTagEventParams, 'taggedKind'> & {
  mutationId: string;
  expectedMutationId?: string;
  synced?: boolean;
  isCurrent?: () => boolean;
  /** The tag file a create writes (or restores); deletes ignore it. */
  tagUri?: string;
};

export type TViewerTagMutationsParams = Omit<TTagEventParams, 'label'>;

export type ViewerTagMutation = {
  id: string;
  relationship: boolean;
  expiresAt: number;
  taggersCount: number;
};

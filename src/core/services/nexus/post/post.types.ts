import type { Pubky } from '@/models/models.types';
import type { TPaginationParams, TSkipTagsParams, TTagsPaginationParams } from '@/services/nexus/nexus.types';
export type TCompositeId = {
  compositeId: string;
};

export type TPostBasePathParams = {
  author_id: Pubky;
  post_id: string;
};

export type TPostBase = TPostBasePathParams & {
  viewer_id?: Pubky;
};

// Specific parameter types for each source
export type TPostViewParams = TPostBase & TTagsPaginationParams;

export type TPostTaggersParams = TPostBase &
  TPaginationParams & {
    label: string;
  };

export type TPostTagsParams = TPostViewParams & TSkipTagsParams;

export type TPostQueryParams = TPostViewParams | TPostBase | TPostTaggersParams | TPostTagsParams;

// Path parameters that should NOT be added to query string
export const POST_PATH_PARAMS = ['author_id', 'post_id', 'label'] as const;

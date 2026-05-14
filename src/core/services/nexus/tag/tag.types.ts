import type { Pubky } from '@/models/models.types';
import type { TPaginationParams, TUserStreamReachParams } from '@/services/nexus/nexus.types';

export type TTagViewParams = {
  taggerId: Pubky;
  tagId: string;
};

export type TTagHotParams = TPaginationParams &
  TUserStreamReachParams & {
    user_id?: string;
    taggers_limit?: number;
  };

export type TTagTaggersParams = TPaginationParams &
  TUserStreamReachParams & {
    label: string;
    user_id?: string;
  };

export const TAGS_PATH_PARAMS = ['label'] as const;

export type TTagsQueryParams = TTagHotParams | TTagTaggersParams;

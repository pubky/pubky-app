import type { Pubky } from '@/models/models.types';
import type {
  TPaginationParams,
  TPaginationRangeParams,
  TSkipTagsParams,
  TTagsPaginationParams,
  TUserId,
} from '@/services/nexus/nexus.types';

export type TUserDepthParams = {
  depth?: number;
  viewer_id?: Pubky;
};

export type TUserViewParams = TUserDepthParams & TUserId;

export type TUserPaginationParams = TUserId & TPaginationParams & TPaginationRangeParams;

export type TUserRelationshipParams = TUserId & {
  viewer_id: Pubky;
};

export type TUserTaggersParams = TUserId &
  TPaginationParams &
  TUserDepthParams & {
    label: string;
  };

export type TUserTagsParams = TUserId & TTagsPaginationParams & TUserDepthParams & TSkipTagsParams;

export type TUserQueryParams = TUserViewParams | TUserPaginationParams | TUserTaggersParams | TUserTagsParams;

// Path parameters that should NOT be added to query string
export const USER_PATH_PARAMS = ['user_id', 'label'] as const;

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

/**
 * 404 retries allowed for a single-user profile lookup, after the first attempt.
 *
 * Nexus indexes asynchronously, so a newly created profile can 404 for a moment. The
 * shared budget (five retries, ~15.5s in total) is sized for that indexing window and
 * stays in place for feeds, streams and everything else. A profile lookup is instead a
 * verdict the visitor is waiting on, the "User not found" page, so it retries twice
 * (~1.5s) and then renders, rather than parking the page behind the full window.
 */
export const USER_DETAILS_NOT_FOUND_RETRIES = 2;

import type { TFollowParams } from '@/controllers/user/user.type';
import type { Pubky } from '@/models/models.types';

export type CreateFollowParams = TFollowParams;

export type DeleteFollowParams = TFollowParams;

export interface FollowMutationResult {
  friendshipChanged: boolean;
}

export interface InvalidateTimelineStreamsParams {
  includeFriends: boolean;
}

export interface UpdateUserStreamsParams {
  isFollowing: boolean;
  follower: Pubky;
  followee: Pubky;
  friendshipChanged: boolean;
}

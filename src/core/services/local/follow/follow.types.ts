import type { TFollowParams } from '@/controllers/user/user.type';
import type { Pubky } from '@/models/models.types';

export type CreateFollowParams = TFollowParams;

export type DeleteFollowParams = TFollowParams;

export interface UpdateUserStreamsParams {
  isFollowing: boolean;
  follower: Pubky;
  followee: Pubky;
  friendshipChanged: boolean;
}

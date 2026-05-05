import type { TFollowParams } from '@/controllers/user/user.type';
import type { Pubky } from '@/models/models.types';
import type { PostStreamTypes } from '@/models/stream/post/postStream.types';

export interface CreateFollowParams extends TFollowParams {
  activeStreamId?: PostStreamTypes | null;
}

export interface DeleteFollowParams extends TFollowParams {
  activeStreamId?: PostStreamTypes | null;
}

export interface InvalidateTimelineStreamsParams {
  includeFriends: boolean;
  activeStreamId?: PostStreamTypes | null;
}

export interface UpdateUserStreamsParams {
  isFollowing: boolean;
  follower: Pubky;
  followee: Pubky;
  friendshipChanged: boolean;
  activeStreamId?: PostStreamTypes | null;
}

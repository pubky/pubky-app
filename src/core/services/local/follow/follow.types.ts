import type { TFollowParams } from '@/controllers/user/user.type';
import type { Pubky } from '@/models/models.types';
import type { PostStreamId } from '@/models/stream/post/postStream.types';

export interface CreateFollowParams extends TFollowParams {
  activeStreamId?: PostStreamId | null;
}

export interface DeleteFollowParams extends TFollowParams {
  activeStreamId?: PostStreamId | null;
}

export interface InvalidateTimelineStreamsParams {
  includeFriends: boolean;
  activeStreamId?: PostStreamId | null;
}

export interface UpdateUserStreamsParams {
  isFollowing: boolean;
  follower: Pubky;
  followee: Pubky;
  friendshipChanged: boolean;
  activeStreamId?: PostStreamId | null;
}

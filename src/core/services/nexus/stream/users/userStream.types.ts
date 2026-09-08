import type { Pubky } from '@/models/models.types';
import type { UserStreamId } from '@/models/stream/user/userStream.types';
import type { TPaginationParams, TUserId, UserStreamReach, UserStreamTimeframe } from '@/services/nexus/nexus.types';

export enum USER_STREAM_PREFIX {
  USERS = 'v0/stream/users',
  USER_IDS = 'v0/stream/users/ids',
  USERNAME = 'v0/stream/users/username',
  USERS_BY_IDS = 'v0/stream/users/by_ids',
}

export enum UserStreamSource {
  FOLLOWERS = 'followers',
  FOLLOWING = 'following',
  FRIENDS = 'friends',
  INFLUENCERS = 'influencers',
  RECOMMENDED = 'recommended',
  POST_REPLIES = 'post_replies',
  MOST_FOLLOWED = 'most_followed',
  STARTER_PACK = 'starter_pack',
}

export type TUserStreamBase = TPaginationParams & {
  viewer_id?: Pubky;
  // Provide a random selection of size 3 for sources supporting preview. Passing 'preview', ignores skip and limit parameters
  preview?: boolean;
};

export type TUserStreamWithUserIdParams = TUserId & TUserStreamBase;

export type TUserStreamInfluencersParams = TUserStreamBase &
  TUserId & {
    reach?: UserStreamReach;
    timeframe?: UserStreamTimeframe;
  };

export type TUserStreamPostRepliesParams = TUserStreamBase & {
  author_id: Pubky;
  post_id: string;
};

export type TUserStreamWithDepthParams = TUserStreamBase &
  TUserId & {
    depth?: number;
  };

export type TUserStreamUsernameParams = Omit<TUserStreamBase, 'preview'> & {
  username: string;
};

// tags: comma-joined ordered interest labels (1-5); Nexus rejects `tags` on any other source.
// viewer_id (from TUserStreamBase) doubles as the excluded subject: Nexus drops that user and
// everyone they already follow when user_id is absent.
export type TUserStreamStarterPackParams = TUserStreamBase & {
  tags: string;
};

export type TUserStreamUsersByIdsParams = {
  user_ids: Pubky[];
  viewer_id?: Pubky;
  depth?: number;
};

/**
 * Parameters for fetching user stream from Nexus
 * streamId: Composite stream identifier (e.g., 'user123:followers', 'influencers:today:all')
 * params: Pagination parameters
 */
export type TFetchUserStreamParams = {
  streamId: UserStreamId;
  params: TUserStreamBase;
};

/**
 * Union type of all supported user stream parameter shapes
 * Provides type safety for buildUserStreamUrl function
 */
export type TUserStreamQueryParams =
  | TUserStreamWithUserIdParams
  | TUserStreamInfluencersParams
  | TUserStreamPostRepliesParams
  | TUserStreamWithDepthParams
  | TUserStreamBase
  | TUserStreamUsernameParams
  | TUserStreamStarterPackParams;

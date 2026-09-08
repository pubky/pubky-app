import type { Pubky } from '@/models/models.types';

export type TFollowParams = {
  follower: Pubky;
  followee: Pubky;
};

export type TPubkyListParams = {
  userIds: Pubky[];
};

/**
 * Full user fetch. `viewerId` scopes the relationship Nexus returns; without it the
 * persisted relationship row reads as "not following" for everyone. `UserController`
 * defaults it to the signed-in user, so callers only pass it to override.
 */
export type TFetchUserParams = {
  userId: Pubky;
  viewerId?: Pubky;
};

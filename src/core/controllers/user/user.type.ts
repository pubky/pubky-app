import type { Pubky } from '@/models/models.types';
export type TFollowParams = {
  follower: Pubky;
  followee: Pubky;
};

export type TPubkyListParams = {
  userIds: Pubky[];
};

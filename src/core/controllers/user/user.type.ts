import * as Core from '@/core';

export type TFollowParams = {
  follower: Core.Pubky;
  followee: Core.Pubky;
};

export type TPubkyListParams = {
  userIds: Core.Pubky[];
};

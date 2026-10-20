// Consumed by VRT `useUserStream` mocks (home, hot, search, and the Who to follow page).
import type { UserStreamUser } from '@/hooks/useUserStream/useUserStream.types';
import { VRT_AUTHOR_PROFILES, VRT_AUTHOR_PUBKYS } from './profiles';

function buildSuggestedUser(
  pubky: keyof typeof VRT_AUTHOR_PUBKYS,
  counts: UserStreamUser['counts'],
  tags: string[],
): UserStreamUser {
  const pubkyId = VRT_AUTHOR_PUBKYS[pubky];
  const profile = VRT_AUTHOR_PROFILES[pubkyId];
  return {
    id: profile.id,
    name: profile.name,
    bio: profile.bio,
    image: profile.image,
    avatarUrl: profile.image,
    status: profile.status,
    counts,
    isFollowing: false,
    tags,
  };
}

export const VRT_WHO_TO_FOLLOW: readonly UserStreamUser[] = [
  buildSuggestedUser('eira', { posts: 142, tags: 38, followers: 1820, following: 412 }, ['protocols', 'iceland']),
  buildSuggestedUser('dion', { posts: 87, tags: 24, followers: 942, following: 530 }, ['research', 'reading']),
  buildSuggestedUser('fynn', { posts: 211, tags: 51, followers: 2230, following: 188 }, ['music', 'mixing']),
  buildSuggestedUser('hana', { posts: 64, tags: 12, followers: 410, following: 220 }, ['typography']),
  buildSuggestedUser('glen', { posts: 99, tags: 19, followers: 758, following: 305 }, ['cycling', 'databases']),
];

/**
 * Who to follow page list. Same people as `VRT_WHO_TO_FOLLOW`, with alternating
 * follow state so one capture shows both the Follow and Following buttons.
 * Odd positions are already followed.
 */
export const VRT_WHO_TO_FOLLOW_PAGE: readonly UserStreamUser[] = VRT_WHO_TO_FOLLOW.map((user, index) => ({
  ...user,
  isFollowing: index % 2 === 1,
}));

/**
 * Active-users sidebar on the Who to follow page (`influencers:today:all`).
 * Bran and Cleo are not in the recommendation list. Fynn is, with the same
 * counts and follow state as `VRT_WHO_TO_FOLLOW_PAGE`. Cleo is already followed
 * so the compact row shows the Following icon.
 */
export const VRT_WHO_TO_FOLLOW_ACTIVE_USERS: readonly UserStreamUser[] = [
  buildSuggestedUser('bran', { posts: 87, tags: 24, followers: 640, following: 118 }, ['bitcoin', 'distsys']),
  {
    ...buildSuggestedUser('cleo', { posts: 142, tags: 18, followers: 880, following: 96 }, ['photography']),
    isFollowing: true,
  },
  buildSuggestedUser('fynn', { posts: 211, tags: 51, followers: 2230, following: 188 }, ['music', 'mixing']),
];

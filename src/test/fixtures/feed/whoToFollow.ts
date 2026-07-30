// Consumed by VRT test harness (mocks for `useUserStream` in Home.vrt.test.tsx).
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

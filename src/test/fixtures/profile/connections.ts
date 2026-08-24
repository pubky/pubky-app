// Consumed by `Profile.vrt.test.tsx` for the Followers, Following, and
// Friends tabs (`useProfileConnections`).
import type { UserConnectionData } from '@/hooks/useProfileConnections/useProfileConnections.types';
import { VRT_AUTHOR_PROFILES, VRT_AUTHOR_PUBKYS } from '../feed/profiles';

function buildConnection(
  pubky: keyof typeof VRT_AUTHOR_PUBKYS,
  stats: UserConnectionData['stats'],
  tags: string[],
  isFollowing: boolean,
): UserConnectionData {
  const id = VRT_AUTHOR_PUBKYS[pubky];
  const profile = VRT_AUTHOR_PROFILES[id];
  return {
    ...profile,
    avatarUrl: null,
    tags,
    stats,
    isFollowing,
  };
}

/** Everyone who follows Alice — feeds the Profile Followers tab. */
export const VRT_FOLLOWERS: readonly UserConnectionData[] = [
  buildConnection('bran', { tags: 24, posts: 87 }, ['distsys', 'bitcoin'], true),
  buildConnection('cleo', { tags: 18, posts: 142 }, ['photography'], false),
  buildConnection('dion', { tags: 9, posts: 61 }, ['reading'], true),
  buildConnection('eira', { tags: 41, posts: 103 }, ['protocols', 'iceland'], true),
  buildConnection('fynn', { tags: 33, posts: 178 }, ['music', 'mixing'], false),
  buildConnection('glen', { tags: 12, posts: 54 }, ['cycling', 'databases'], true),
  buildConnection('hana', { tags: 7, posts: 39 }, ['typography'], false),
];

/** Everyone Alice follows — feeds the Profile Following tab. */
export const VRT_FOLLOWING: readonly UserConnectionData[] = [
  buildConnection('bran', { tags: 24, posts: 87 }, ['distsys', 'bitcoin'], true),
  buildConnection('cleo', { tags: 18, posts: 142 }, ['photography'], true),
  buildConnection('eira', { tags: 41, posts: 103 }, ['protocols', 'iceland'], true),
  buildConnection('fynn', { tags: 33, posts: 178 }, ['music', 'mixing'], true),
  buildConnection('glen', { tags: 12, posts: 54 }, ['cycling', 'databases'], true),
  buildConnection('hana', { tags: 7, posts: 39 }, ['typography'], true),
];

/** Mutual follows — feeds the Profile Friends tab. */
export const VRT_FRIENDS: readonly UserConnectionData[] = [
  buildConnection('bran', { tags: 24, posts: 87 }, ['distsys', 'bitcoin'], true),
  buildConnection('eira', { tags: 41, posts: 103 }, ['protocols', 'iceland'], true),
  buildConnection('glen', { tags: 12, posts: 54 }, ['cycling', 'databases'], true),
  buildConnection('cleo', { tags: 18, posts: 142 }, ['photography'], true),
];

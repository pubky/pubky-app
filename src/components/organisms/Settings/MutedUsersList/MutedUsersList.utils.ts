import type { MutedUser, UserMapEntry } from './MutedUsersList.types';

/**
 * Maps an array of user IDs to MutedUser objects using a users map.
 * Extracts name and avatar from the users map for each ID.
 */
export function mapUserIdsToMutedUsers(
  userIds: string[],
  usersMap: Map<string, UserMapEntry | undefined>,
): MutedUser[] {
  return userIds.map((id) => {
    const user = usersMap.get(id);
    return {
      id,
      name: user?.name,
      avatar: user?.avatarUrl ?? undefined,
    };
  });
}

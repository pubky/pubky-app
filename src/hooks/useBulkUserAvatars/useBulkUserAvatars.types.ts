import type { Pubky } from '@/models/models.types';

export interface UserWithAvatar {
  id: Pubky;
  name?: string;
  avatarUrl?: string;
}

export interface UseBulkUserAvatarsResult {
  /** Map of user ID to user data with avatar */
  usersMap: Map<Pubky, UserWithAvatar>;
  /** Get users with avatars for a list of IDs */
  getUsersWithAvatars: (userIds: Pubky[]) => UserWithAvatar[];
  /** Whether the data is still loading */
  isLoading: boolean;
}

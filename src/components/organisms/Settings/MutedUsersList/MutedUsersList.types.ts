/** Row shape for the muted-users settings list (IDs + hydrated profile fields). */
export interface MutedUser {
  id: string;
  name?: string;
  avatar?: string;
}

export interface UserMapEntry {
  name?: string;
  avatarUrl?: string | null;
}

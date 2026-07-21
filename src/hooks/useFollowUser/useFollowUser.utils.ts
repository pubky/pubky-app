import { UserController } from '@/controllers/user/user';
import { formatPublicKey, truncateString } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';

/**
 * Resolves the display name shown in follow/unfollow feedback (toasts, etc.).
 * Uses the provided name when available; otherwise formats and truncates the pubky.
 */
export function resolveFollowDisplayName(userId: Pubky, name?: string | null): string {
  if (name) {
    return name;
  }

  return truncateString(formatPublicKey({ key: userId }), 15);
}

/**
 * Resolves follow/unfollow feedback display name, fetching profile details when no name is provided.
 */
export async function resolveFollowToastDisplayName(userId: Pubky, name?: string | null): Promise<string> {
  if (name) {
    return name;
  }

  try {
    const details = await UserController.getDetails({ userId });
    return resolveFollowDisplayName(userId, details?.name);
  } catch {
    return resolveFollowDisplayName(userId, name);
  }
}

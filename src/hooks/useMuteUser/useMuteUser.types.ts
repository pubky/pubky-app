import type { Pubky } from '@/models/models.types';
export interface UseMuteUserResult {
  /** Toggles mute status for a user */
  toggleMute: (userId: Pubky, isCurrentlyMuted: boolean) => Promise<void>;
  /** Whether a mute/unmute action is in progress */
  isLoading: boolean;
  /** The user ID currently being muted/unmuted (null if none) */
  loadingUserId: Pubky | null;
  /** Helper to check if a specific user is loading */
  isUserLoading: (userId: Pubky) => boolean;
  /** Error message if the action failed */
  error: string | null;
}

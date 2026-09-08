import type { MouseEvent } from 'react';

export type FollowButtonVariant = 'icon' | 'iconWithText';

export interface FollowButtonProps {
  /** Whether the viewer already follows this user */
  isFollowing: boolean;
  /** Whether a follow/unfollow action is in flight for this user */
  isLoading: boolean;
  /** Whether the follow status itself is still being resolved */
  isStatusLoading: boolean;
  /** Display name used to build the accessible label */
  displayName: string;
  /** `icon` renders a circular icon-only button; `iconWithText` renders a labelled button */
  variant: FollowButtonVariant;
  onClick: (e: MouseEvent) => void;
}

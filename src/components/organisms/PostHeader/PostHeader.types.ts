import type {
  PostHeaderCharacterLimitPlacement,
  PostHeaderSize,
} from '@/molecules/PostHeaderUserInfo/PostHeaderUserInfo.utils';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';

export type { PostHeaderSize };

export interface PostHeaderProps {
  postId: string;
  isReplyInput?: boolean;
  characterLimit?: {
    count: number;
    max: number;
  };
  characterLimitPlacement?: PostHeaderCharacterLimitPlacement;
  showPopover?: boolean;
  /** Reuses profile data already resolved by a parent and avoids a fresh loading state on remount. */
  userDetails?: NexusUserDetails | null;
  /** When false, only the avatar is rendered (wide / list composers). */
  showUserInfo?: boolean;
  /** Visually hides the avatar while preserving its layout space. */
  visuallyHideAvatar?: boolean;
  size?: PostHeaderSize;
  timeAgoPlacement?: 'top-right' | 'bottom-left';
  /**
   * When `false`, the author avatar and name render as text instead of profile
   * links (quoted post in the Reply/Repost dialogs, where a navigation would
   * land behind the open modal). Defaults to `true`.
   */
  navigable?: boolean;
}

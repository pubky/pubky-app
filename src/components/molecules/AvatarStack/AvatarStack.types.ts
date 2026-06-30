import type { AvatarSize } from '@/atoms/Avatar/Avatar.variants';
import type { Pubky } from '@/models/models.types';

export interface AvatarStackProps {
  /**
   * Ordered list of pubkys to render. Each slot resolves its own profile
   * via `useUserProfile`. Duplicates should be de-duplicated by the caller —
   * `AvatarStack` renders the list as-is.
   */
  pubkys: Pubky[];
  /**
   * Max number of avatars to render before collapsing the rest behind a
   * `+N` overflow chip.
   *
   * Defaults to `COLLECTIONS_SECTION_AVATAR_STACK_MAX` to match the
   * Collections section headers, but other surfaces can override.
   */
  max?: number;
  /** Avatar size; passed through to `AvatarWithFallback`. */
  size?: AvatarSize;
  /** Optional extra classes for the outer container. */
  className?: string;
  /** Custom test id for the outer container. */
  'data-testid'?: string;
}

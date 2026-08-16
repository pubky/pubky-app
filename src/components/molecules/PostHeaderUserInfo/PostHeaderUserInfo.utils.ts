import type { AvatarSize } from '@/atoms/Avatar/Avatar.variants';

export type PostHeaderSize = 'normal' | 'large' | 'extraLarge';
export type PostHeaderCharacterLimitPlacement = 'metadata' | 'name-row';

export const AVATAR_SIZE_BY_HEADER_SIZE: Record<PostHeaderSize, AvatarSize> = {
  normal: 'default',
  large: 'lg',
  extraLarge: 'xl',
};

/** Tailwind size classes matching `AVATAR_SIZE_BY_HEADER_SIZE` — use for layout spacers. */
export const AVATAR_CLASS_BY_HEADER_SIZE: Record<PostHeaderSize, string> = {
  normal: 'size-10',
  large: 'size-12',
  extraLarge: 'size-16',
};

export const GAP_CLASS_BY_HEADER_SIZE: Record<PostHeaderSize, string> = {
  normal: 'gap-3',
  large: 'gap-4',
  extraLarge: 'gap-5',
};

export const USERNAME_CLASS_BY_HEADER_SIZE: Record<PostHeaderSize, string> = {
  normal: 'text-base leading-5',
  large: 'text-xl leading-7',
  extraLarge: 'text-2xl leading-8',
};

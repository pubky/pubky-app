import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';

export interface TaggerAvatarProps {
  tagger: TaggerWithAvatar;
  index: number;
}

export interface PostTagPopoverWrapperProps {
  /** Array of taggers with avatar data */
  taggers: TaggerWithAvatar[];
  /** Total number of taggers for overflow calculation */
  taggersCount: number;
  /** The tag element to wrap */
  children: React.ReactNode;
}

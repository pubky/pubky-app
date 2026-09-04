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
  /** Post composite ID used to fetch full tagger list when available */
  postId?: string | null;
  /** Tag label used to fetch full tagger list when available */
  tagLabel?: string;
  /** Whether the viewer currently tags the post with this label; keeps the full list in sync with their toggles */
  relationship?: boolean;
  /** The tag element to wrap */
  children: React.ReactNode;
}

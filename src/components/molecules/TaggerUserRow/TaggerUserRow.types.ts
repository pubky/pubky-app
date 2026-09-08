import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';

export interface TaggerUserRowProps {
  /** The tagger user data */
  tagger: TaggerWithAvatar;
  /** Whether the user data is loading */
  isLoading: boolean;
  /** Whether this is the current user */
  isCurrentUser: boolean;
  /** Callback when user is clicked */
  onUserClick: (userId: string) => void;
  /** Callback when follow button is clicked */
  onFollowClick: (userId: string, isFollowing: boolean) => void;
}

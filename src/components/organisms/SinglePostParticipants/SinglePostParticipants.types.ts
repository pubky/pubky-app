import type { PostParticipant } from '@/hooks/usePostParticipants/usePostParticipants.types';

export interface SinglePostParticipantsProps {
  /** The composite post ID (format: authorId:postId) */
  postId: string;
  /** Optional className for the container */
  className?: string;
}

export interface ParticipantItemProps {
  /** Participant data */
  participant: PostParticipant;
  /** Current user ID to check if participant is self */
  currentUserId: string | null;
  /** Callback when user is clicked */
  onUserClick: (pubky: string) => void;
  /** Callback when follow button is clicked */
  onFollowClick: (userId: string, isFollowing: boolean) => Promise<void>;
  /** Function to check if a user's follow action is loading */
  isUserLoading: (userId: string) => boolean;
}

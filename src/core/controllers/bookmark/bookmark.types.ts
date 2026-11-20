import type { Pubky } from '@/models/models.types';

export type TBookmarkEventParams = {
  userId: Pubky; // Still needed for generating homeserver URI
  postId: string; // Composite post ID (authorId:postId)
};

export type TResourceBookmarkParams = {
  /** The bookmarker (current user). */
  userId: Pubky;
  /** The external resource's link exactly as written. */
  uri: string;
};

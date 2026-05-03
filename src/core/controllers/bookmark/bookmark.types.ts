import type { Pubky } from '@/models/models.types';
export type TBookmarkEventParams = {
  userId: Pubky; // Still needed for generating homeserver URI
  postId: string; // Composite post ID (authorId:postId)
};

import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';

export interface BookmarkModelSchema {
  id: string;
  created_at: number;
}

/** A bookmark row with the cached details of its post; `details` is `undefined` while the post is not cached. */
export interface BookmarkedPostDetails extends BookmarkModelSchema {
  details: PostDetailsModelSchema | undefined;
}

export const bookmarkTableSchema = `
  &id,
  created_at
`;

import type { Pubky } from '@/models/models.types';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';

export type CollectionContent = {
  name: string;
  description: string;
  items: string[];
  /** Optional cover image URL (pubky/http/https). `null` when not set. */
  cover_image: string | null;
};

export type CollectionContentInput = {
  name: string;
  description?: string | null;
  items?: string[] | null;
  /** Optional cover image URL. Validated against the spec attachment URL rules. */
  coverImage?: string | null;
};

export type CollectionPost = {
  details: PostDetailsModelSchema;
  content: CollectionContent;
};

export type TAuthoredCollectionsParams = {
  authorId: Pubky;
  viewerId?: Pubky | null;
};

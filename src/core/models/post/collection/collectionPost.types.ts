import type { CollectionLayout } from '@/config/collections';
import type { Pubky } from '@/models/models.types';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';

/**
 * A collection envelope as this client shows it: items by URI. The stored envelope also carries a
 * note per item and members other clients added; edits merge onto it (`CollectionPostContent.toStored`).
 */
export type CollectionContent = {
  name: string;
  description?: string;
  items?: string[];
  cover_image?: string;
  layout: CollectionLayout;
};

export type CollectionContentInput = {
  name: string;
  description?: string | null;
  items?: string[] | null;
  /** Optional cover image URL. Validated against the spec attachment URL rules. */
  coverImage?: string | null;
  /** Creator-selected default layout. Missing values retain the legacy Grid behavior. */
  layout?: CollectionLayout;
};

export type CollectionPost = {
  details: PostDetailsModelSchema;
  content: CollectionContent;
};

export type TAuthoredCollectionsParams = {
  authorId: Pubky;
  viewerId?: Pubky | null;
};

import type { PubkyAppCollectionContent } from 'pubky-app-specs';
import type { CollectionLayout } from '@/config/collections';
import type { Pubky } from '@/models/models.types';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';

export type CollectionContent = PubkyAppCollectionContent & { layout: CollectionLayout };

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

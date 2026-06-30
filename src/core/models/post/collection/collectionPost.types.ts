import type { PubkyAppCollectionContent } from 'pubky-app-specs';
import type { Pubky } from '@/models/models.types';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';

export type CollectionContentInput = {
  name: string;
  description?: string | null;
  items?: string[] | null;
  /** Optional cover image URL. Validated against the spec attachment URL rules. */
  coverImage?: string | null;
};

export type CollectionPost = {
  details: PostDetailsModelSchema;
  content: PubkyAppCollectionContent;
};

export type TAuthoredCollectionsParams = {
  authorId: Pubky;
  viewerId?: Pubky | null;
};

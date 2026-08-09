import type { CollectionLayout } from '@/config/collections';
import type { TTagEventParams } from '@/controllers/tag/tag.types';
import type { Pubky } from '@/models/models.types';
import type { TCompositeId } from '@/services/nexus/post/post.types';

export interface TCreatePostParams {
  authorId: Pubky;
  content: string;
  isArticle?: boolean;
  tags?: string[];
  attachments?: File[];
  parentPostId?: string;
  originalPostId?: string;
}

export interface TCreateCollectionParams {
  authorId: Pubky;
  name: string;
  description?: string | null;
  items?: string[] | null;
  layout?: CollectionLayout;
  /**
   * Optional cover image. Either:
   * - a `File` (uploaded to the homeserver, the resulting `pubky://` URL is
   *   stored as `cover_image` in the collection envelope), or
   * - a string URL already accessible by Nexus (pubky/http/https), or
   * - `null` / `undefined` for no cover.
   */
  coverImage?: File | string | null;
}

export interface TUpdateCollectionItemParams {
  collectionId: string;
  postId: string;
  shouldAdd: boolean;
}

export interface TReorderCollectionItemsParams {
  collectionId: string;
  /**
   * Full item-URI order as drafted by the user. Merged against the live
   * envelope on commit (see `CollectionPostContent.reorderItems`), so a stale
   * draft cannot resurrect removed items or drop concurrently added ones.
   */
  items: string[];
}

export interface TEditCollectionParams {
  compositeCollectionId: string;
  name: string;
  description?: string | null;
  layout?: CollectionLayout;
  /**
   * Required cover image decision for the edit. Either:
   * - a `File` (uploaded to the homeserver, the resulting `pubky://` URL replaces `cover_image`),
   * - a string URL already accessible by Nexus (pass the current cover URL unchanged to keep it),
   * - `null` to clear the cover.
   *
   * Must be passed explicitly — omitting it is not allowed, so a metadata-only
   * edit cannot accidentally clear/delete the existing homeserver cover.
   */
  coverImage: File | string | null;
}

export interface TDeletePostParams {
  compositePostId: string;
}

export interface TEditPostParams {
  compositePostId: string;
  content: string;
}

export interface TFileAttachmentsParams {
  attachments: File[];
  pubky: Pubky;
}

export interface TNormalizeTagsParams {
  tags: TTagEventParams[];
}

export interface TFetchMorePostTagsParams extends TCompositeId {
  skip?: number;
  limit?: number;
  viewerId?: Pubky;
}

export interface TFetchPostTaggersParams extends TCompositeId {
  label: string;
  skip?: number;
  limit?: number;
  viewerId?: Pubky;
}

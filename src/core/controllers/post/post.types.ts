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
  /**
   * Already-uploaded homeserver file URIs owned by the author (article inline
   * images, uploaded at insert time). Appended after the `attachments` upload
   * results in the post's attachment list, so an article's final order is
   * `[cover?, ...inline]`. Not uploaded or rolled back here — the composer
   * session that uploaded them owns their cleanup.
   */
  attachmentUris?: string[];
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

export interface TEditPostAttachments {
  /**
   * The attachment URIs the edit composer was seeded from — the snapshot taken
   * when the dialog opened. Removal is computed against THIS list, never the
   * live post row: the row can change underneath an open dialog (another
   * tab/device, background refresh), and diffing against it would delete files
   * the user never saw.
   */
  original: string[];
  /**
   * Subset of `original` to keep, in display order (no duplicates). Attachments
   * in `original` but not in `kept` were removed by the user and are deleted
   * from the homeserver (best-effort) after a successful edit. When `nextOrder`
   * is set, removal is diffed against `nextOrder` instead and `kept` only
   * feeds the subset validation.
   */
  kept: string[];
  /** New files to upload; appended after `kept` in display order. Must be empty when `nextOrder` is set. */
  added: File[];
  /**
   * Article inline-image path: homeserver file URIs owned by the author that
   * were already uploaded this composer session (insert-time uploads, plus a
   * replacement cover uploaded before commit). Requires `nextOrder`.
   */
  addedUris?: string[];
  /**
   * Article inline-image path: the full attachment list to persist, in final
   * slot order (`[cover?, ...inline first-appearance]`). Every entry must come
   * from `kept` or `addedUris`. Duplicates are allowed — the same URI may
   * legitimately occupy the cover slot and an inline slot. When set, `added`
   * must be empty and the envelope attachments are exactly this list.
   */
  nextOrder?: string[];
}

export interface TEditPostParams {
  compositePostId: string;
  content: string;
  /**
   * Attachment changes for the edit. `undefined` leaves attachments untouched
   * (content-only edit); `{ kept: [], added: [] }` removes them all. Current
   * attachments not listed in `kept` are deleted from the homeserver
   * (best-effort) after a successful edit.
   */
  attachments?: TEditPostAttachments;
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

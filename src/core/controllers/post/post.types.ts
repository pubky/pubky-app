import type { CollectionLayout } from '@/config/collections';
import type { TTagEventParams } from '@/controllers/tag/tag.types';
import type { Pubky } from '@/models/models.types';
import type { TCompositeId } from '@/services/nexus/post/post.types';

export interface TCreatePostParams {
  authorId: Pubky;
  content: string;
  isArticle?: boolean;
  tags?: string[];
  /** The post's media; for an article, the inline files its body references, in slot order. */
  attachments?: File[];
  /** An article's cover, written in the envelope (`cover_image`); ignored for any other post. */
  coverImage?: File;
  /** The Pubky post this post replies to. Never with `parentUri`. */
  parentPostId?: string;
  /**
   * An external resource this post replies to (social v1 `parent`, any URI the spec allows; the app
   * writes a web link or a known identifier scheme, as written). Never with `parentPostId`.
   */
  parentUri?: string;
  originalPostId?: string;
  /**
   * The external resource the post embeds (social v1 `embed`, an `http(s)` link or another scheme's
   * URI such as `isbn:…`, stored as written). A post has one embed, so it never comes with
   * `originalPostId`.
   */
  embedUrl?: string;
  /**
   * `pubky://` URL of a Locks lock file. Set only when this post is the public announcement of locked
   * content; the locked content itself never goes through this controller.
   */
  lock?: string;
  /** Runs once the post is on the homeserver; a later failure (its tags) still throws but leaves the post live. */
  onPostSynced?: () => void;
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

export interface TUpdateCollectionResourceParams {
  collectionId: string;
  /** The external resource's link (`getResourceTarget`): the item's `uri` when a collection can hold it. */
  uri: string;
  /** Other spellings of the link (`getResourceTarget`): a removal takes them out too. */
  spellings?: readonly string[];
  shouldAdd: boolean;
}

export interface TReorderCollectionItemsParams {
  collectionId: string;
  /**
   * Full item-URI order as drafted by the user. Passed as a reorder change and merged against the
   * stored head under the post's write lock (`CollectionPostContent.reorderItems`), so a stale draft
   * cannot resurrect removed items or drop concurrently added ones.
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
   * edit cannot accidentally clear the existing cover.
   */
  coverImage: File | string | null;
}

export interface TDeletePostParams {
  compositePostId: string;
}

export interface TEditPostAttachments {
  /**
   * The attachment URIs the edit composer was seeded from — the snapshot taken
   * when the dialog opened. `kept` is validated against THIS list, never the
   * live post row, which can change underneath an open dialog (another
   * tab/device, background refresh).
   */
  original: string[];
  /**
   * Subset of `original` to keep, in display order (no duplicates). Attachments
   * in `original` but not in `kept` were removed by the user and leave the post;
   * their files are never deleted, since the earlier versions still reference
   * them (ADR-0027). When `nextOrder` is set, `kept` only feeds the subset
   * validation.
   */
  kept: string[];
  /** New files to upload; appended after `kept` in display order. Must be empty when `nextOrder` is set. */
  added: File[];
  /**
   * Article inline-media path: homeserver file URIs owned by the author that
   * the composer uploaded before the commit (the inline files staged this
   * session). Requires `nextOrder`.
   */
  addedUris?: string[];
  /**
   * Article inline-media path: the full attachment list to persist, in final
   * slot order (`[...inline first-appearance, ...unreferenced originals]`; the
   * cover is no slot, it goes in `coverImage`). Every entry must come from
   * `kept` or `addedUris`. When set, `added` must be empty and the envelope
   * attachments are exactly this list.
   */
  nextOrder?: string[];
}

export interface TEditPostParams {
  compositePostId: string;
  content: string;
  /**
   * Attachment changes for the edit. `undefined` leaves attachments untouched
   * (content-only edit); `{ kept: [], added: [] }` removes them all from the
   * post. No file is deleted.
   */
  attachments?: TEditPostAttachments;
  /**
   * An article's cover decision: a homeserver file URI of the author's to set, `null` to clear,
   * `undefined` to keep the stored one. The cover it replaces or clears stays on the homeserver.
   */
  coverImage?: string | null;
  /**
   * The external resource the next version embeds, `null` for none, `undefined` to keep the stored `embed`. A
   * repost's embedded post is never replaced.
   */
  embedUrl?: string | null;
}

export interface TFileAttachmentsParams {
  attachments: File[];
  pubky: Pubky;
}

export interface TNormalizeTagsParams {
  tags: TTagEventParams[];
}

export interface TFetchPostTaggersParams extends TCompositeId {
  label: string;
  skip?: number;
  limit?: number;
  viewerId?: Pubky;
}

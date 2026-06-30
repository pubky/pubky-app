import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';

export interface LocalFilesState {
  /**
   * Current user's profile avatar blob URL.
   * Used for instant visual feedback before CDN indexes the uploaded avatar.
   */
  profile: string | null;

  /**
   * Post attachments keyed by compositePostId.
   * Each post can have multiple attachments (array of AttachmentConstructed).
   *
   * @example
   * {
   *   "pk:abc123/posts/xyz789": [
   *     { type: "image", name: "photo.jpg", urls: { main: "blob:...", feed: "blob:..." } },
   *     { type: "video", name: "clip.mp4", urls: { main: "blob:..." } }
   *   ],
   *   "pk:abc123/posts/def456": [
   *     { type: "image", name: "avatar.png", urls: { main: "blob:..." } }
   *   ]
   * }
   */
  posts: Record<string, AttachmentConstructed[] | undefined>;

  /**
   * Collection cover images keyed by composite collection id.
   * Used for instant cover preview before the CDN indexes the uploaded file.
   *
   * @example
   * {
   *   "pk:abc123/posts/xyz789": "blob:..."
   * }
   */
  collections: Record<string, string | undefined>;
}

export interface LocalFilesActions {
  /**
   * Set or clear the profile avatar blob URL.
   * Automatically revokes the previous blob URL to prevent memory leaks.
   */
  setProfile: (blobUrl: string | null) => void;

  /**
   * Set attachments for a post. Pass empty array to clear.
   * Automatically revokes previous blob URLs to prevent memory leaks.
   */
  setPostAttachments: (postId: string, attachments: AttachmentConstructed[]) => void;

  /**
   * Set or clear the cover image blob URL for a collection.
   * Pass `null` to clear the entry. Automatically revokes the previous blob URL.
   */
  setCollectionCover: (collectionId: string, blobUrl: string | null) => void;

  /**
   * Reset all state and revoke all blob URLs.
   * Called on logout.
   */
  reset: () => void;
}

export type LocalFilesStore = LocalFilesState & LocalFilesActions;

export const localFilesInitialState: LocalFilesState = {
  profile: null,
  posts: {},
  collections: {},
};

export enum LocalFilesActionTypes {
  SET_PROFILE = 'SET_PROFILE',
  SET_POST_ATTACHMENTS = 'SET_POST_ATTACHMENTS',
  SET_COLLECTION_COVER = 'SET_COLLECTION_COVER',
  RESET = 'RESET',
}

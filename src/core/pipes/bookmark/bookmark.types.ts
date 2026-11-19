/** One entry of the bookmarks directory listing that names a bookmark of a post, or may. */
export type TBookmarkListing = {
  /** The listed file. */
  url: string;
  /**
   * The composite id (`author:postId`) of the bookmarked post, which the filename spells; null
   * for the overflow form `~{hash}`, whose target only the stored object holds.
   */
  postId: string | null;
};

/** A stored bookmark as the local `bookmarks` table needs it. */
export type TStoredBookmark = {
  /** The composite id of the bookmarked post; null when the bookmark targets anything else. */
  postId: string | null;
  /** When the bookmark was made, in milliseconds. */
  createdAt: number;
};

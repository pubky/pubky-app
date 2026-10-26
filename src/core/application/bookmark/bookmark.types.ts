export type TBookmarkPersistInput = {
  postId: string; // Composite post ID (authorId:postId)
  bookmarkUrl: string;
  /** The bytes to PUT; absent on a delete. */
  bookmarkBody?: Uint8Array;
};

export type TCreateBookmarkInput = Required<TBookmarkPersistInput>;

export type TDeleteBookmarkInput = Omit<TCreateBookmarkInput, 'bookmarkBody'>;

export interface UsePostReplyOptions {
  postId: string;
  onSuccess?: (createdPostId: string) => void;
}

export interface UsePostPostOptions {
  onSuccess?: (createdPostId: string) => void;
}

export interface UsePostRepostOptions {
  originalPostId: string;
  /** Original post author's name for the toast message */
  originalAuthorName?: string;
  onSuccess?: (createdPostId: string) => void;
  /** Called when user clicks Undo in the toast */
  onUndo: (createdPostId: string) => void;
}

export interface UsePostEditOptions {
  editPostId: string;
  onSuccess?: (createdPostId: string) => void;
}

import type { Dispatch, SetStateAction } from 'react';

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
  /**
   * Overrides the success toast title (e.g. "Share Collection" reuses the
   * repost flow but reads as a collection action). Falls back to the standard
   * "Reposted {author}'s post" copy when omitted.
   */
  successToastTitle?: string;
  onSuccess?: (createdPostId: string) => void;
  /** Called when user clicks Undo in the toast */
  onUndo: (createdPostId: string) => void;
}

export interface UsePostEditOptions {
  editPostId: string;
  /**
   * The attachment URIs the edit composer was seeded from (the snapshot taken
   * when the dialog opened — NOT the live post row, which can change underneath
   * an open dialog). Used to detect whether the attachment set changed; when it
   * didn't, the edit is committed content-only.
   */
  originalAttachmentUris?: string[];
  /**
   * Article-only: original attachment URIs that were NOT presented to the user
   * at open (not the cover, not referenced by the body — e.g. attachments from
   * other clients or targets of malformed refs). Carried through the edit at
   * the tail of the attachment list so an unrelated edit never deletes files
   * the user did not see and remove.
   */
  preservedAttachmentUris?: string[];
  onSuccess?: (createdPostId: string) => void;
}

/**
 * An attachment already persisted on the post being edited. Identified by its
 * homeserver file URI; removing it from the composer removes it from the post
 * (and deletes the file) on submit.
 */
export type ExistingAttachment = {
  /** Homeserver file URI (`pubky://…/files/<id>`) — kept on the post when submitted. */
  uri: string;
  /** MIME content type; placeholder until metadata resolves. */
  type: string;
  name: string;
  /** Resolved render URLs (local blob or CDN); `null` while metadata is loading. */
  urls: { main: string; feed?: string } | null;
  /**
   * Set when metadata resolution (local + Nexus backfill) has terminally failed.
   * Distinguishes "still loading" (skeleton) from "unknowable" (generic file
   * card, still removable and still kept on submit).
   */
  resolutionFailed?: boolean;
};

export interface UsePostReturn {
  content: string;
  setContent: Dispatch<SetStateAction<string>>;
  tags: string[];
  setTags: Dispatch<SetStateAction<string[]>>;
  attachments: File[];
  setAttachments: Dispatch<SetStateAction<File[]>>;
  existingAttachments: ExistingAttachment[];
  setExistingAttachments: Dispatch<SetStateAction<ExistingAttachment[]>>;
  isArticle: boolean;
  setIsArticle: Dispatch<SetStateAction<boolean>>;
  articleTitle: string;
  setArticleTitle: Dispatch<SetStateAction<string>>;
  reply: (options: UsePostReplyOptions) => Promise<void>;
  post: (options: UsePostPostOptions) => Promise<void>;
  repost: (options: UsePostRepostOptions) => Promise<void>;
  edit: (options: UsePostEditOptions) => Promise<void>;
  isSubmitting: boolean;
  /** Article inline-image editor surface (upload at insert time + session preview lookup). */
  inlineImages: {
    upload: (file: File) => Promise<string>;
    getPreviewUrl: (src: string) => string | null;
  };
  /** Inline image uploads currently in flight; publishing is blocked while > 0. */
  uploadingCount: number;
}

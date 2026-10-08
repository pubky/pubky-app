import type { Dispatch, SetStateAction } from 'react';

export interface UsePostOptions {
  /** A captured lock draft needs the article's uploaded images after the composer was emptied. */
  keepInlineMedia?: boolean;
}

/**
 * An article body in published form: `body` references its images by `attachment:{n}` slot and
 * `inlineFiles` holds them in slot order, after the cover.
 */
export type SerializedArticle = {
  body: string;
  inlineFiles: File[];
};

export interface UsePostReplyOptions {
  postId: string;
  onSuccess?: (createdPostId: string) => void;
}

/**
 * The article title and body as the inputs hold them right now. `articleTitle` and `content` trail
 * the inputs by the composer's debounce, so a publish that read them could drop an image inserted
 * in the last half second and then delete its upload as unreferenced.
 */
export interface LatestArticle {
  title: string;
  body: string;
}

export interface UsePostPostOptions {
  /** Article publishes pass the latest editor values; omitted, the debounced state is used. */
  article?: LatestArticle;
  onSuccess?: (createdPostId: string) => void;
}

export interface UsePostRepostOptions {
  originalPostId: string;
  /**
   * Overrides the success toast title (e.g. "Share Collection" reuses the
   * repost flow but reads as a collection action). Falls back to 'Reposted'
   * when omitted.
   */
  successToastTitle?: string;
  onSuccess?: (createdPostId: string) => void;
  /** Called when user clicks Undo in the toast */
  onUndo: (createdPostId: string) => void;
}

export interface UsePostEditOptions {
  editPostId: string;
  /** Keeps an existing lock announcement in teaser-envelope mode. */
  isLockAnnouncement?: boolean;
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
  /** Article edits pass the latest editor values; omitted, the debounced state is used. */
  article?: LatestArticle;
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
  urls: { main: string; feed?: string; large?: string } | null;
  /**
   * Set when metadata resolution (local + Nexus backfill) has terminally failed.
   * Distinguishes "still loading" (skeleton) from "unknowable" (generic file
   * card, still removable and still kept on submit).
   */
  resolutionFailed?: boolean;
};

/** The composer fields a lock captures and, when the lock is abandoned, puts back whole. */
export interface ComposerDraft {
  content: string;
  attachments: File[];
  isArticle: boolean;
  articleTitle: string;
}

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
  lockTitle: string;
  setLockTitle: Dispatch<SetStateAction<string>>;
  /** Restores a captured draft as one commit, cover included (an abandoned lock). */
  restoreComposerDraft: (draft: ComposerDraft) => void;
  reply: (options: UsePostReplyOptions) => Promise<void>;
  post: (options: UsePostPostOptions) => Promise<void>;
  repost: (options: UsePostRepostOptions) => Promise<void>;
  edit: (options: UsePostEditOptions) => Promise<void>;
  isSubmitting: boolean;
  /** Article inline media editor surface (upload at insert time, session preview and type lookup). */
  inlineMedia: {
    upload: (file: File) => Promise<string>;
    getPreviewUrl: (src: string) => string | null;
    /** MIME type of a file uploaded this session; null for any other URI */
    getMediaType: (uri: string) => string | null;
    /** File name of a URI uploaded this session; null for anything else. */
    getMediaName: (uri: string) => string | null;
  };
  /** Inline media uploads currently in flight; publishing is blocked while > 0. */
  uploadingCount: number;
  /** Null, after a toast, when a normal publish would refuse the body too. */
  serializeArticleForLock: (body: string) => SerializedArticle | null;
}

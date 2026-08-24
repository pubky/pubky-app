import { type MDXEditorMethods, type MDXEditorProps } from '@mdxeditor/editor';
import type { RefObject } from 'react';
import type { ExistingAttachment } from '@/hooks/usePost/usePost.types';
import type { AutocompleteUserData } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds.types';
import type { PostInputVariant } from '@/organisms/PostInput/PostInput.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';

export interface UsePostInputOptions {
  /** Variant determines if this is a reply, repost, or a new post */
  variant: PostInputVariant;
  /** Optional parent post ID (required if variant is 'reply') */
  postId?: string;
  /** Optional original post ID (required if variant is 'repost') */
  originalPostId?: string;
  /** Optional edit post ID (required if variant is 'edit') */
  editPostId?: string;
  /** The post's current attachment URIs (edit variant only) */
  editAttachmentUris?: string[];
  /** Callback after successful post, receives the created post ID */
  onSuccess?: (createdPostId: string) => void;
  /** Custom placeholder text */
  placeholder?: string;
  /**
   * Overrides the repost success toast title (repost variant only). Lets the
   * shared repost flow read as a different action, e.g. sharing a collection.
   */
  successToastTitle?: string;
  /**
   * Controls whether the component starts in expanded mode.
   * @default false
   */
  expanded?: boolean;
  /** Callback when content, tags, attachments, or article title change */
  onContentChange?: (
    content: string,
    tags: string[],
    attachments: File[],
    articleTitle: string,
    existingAttachments?: ExistingAttachment[],
  ) => void;
  /** Callback when article mode changes */
  onArticleModeChange?: (isArticle: boolean) => void;
}

export interface UsePostInputReturn {
  // Refs
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  markdownEditorRef: RefObject<MDXEditorMethods | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;

  // State
  content: string;
  setContent: React.Dispatch<React.SetStateAction<string>>;
  tags: string[];
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  attachments: File[];
  setAttachments: React.Dispatch<React.SetStateAction<File[]>>;
  existingAttachments: ExistingAttachment[];
  setExistingAttachments: React.Dispatch<React.SetStateAction<ExistingAttachment[]>>;
  isArticle: boolean;
  setIsArticle: React.Dispatch<React.SetStateAction<boolean>>;
  articleTitle: string;
  setArticleTitle: React.Dispatch<React.SetStateAction<string>>;
  isDragging: boolean;
  isExpanded: boolean;
  isSubmitting: boolean;
  showEmojiPicker: boolean;
  setShowEmojiPicker: (show: boolean) => void;

  // Mention autocomplete state
  mentionUsers: AutocompleteUserData[];
  mentionIsOpen: boolean;
  mentionSelectedIndex: number | null;
  setMentionSelectedIndex: (index: number | null) => void;

  // Derived values
  hasContent: boolean;
  displayPlaceholder: string;
  currentUserPubky: string | null;
  currentUserDetails?: NexusUserDetails | null;

  // Handlers
  handleExpand: () => void;
  handleSubmit: () => Promise<void>;
  handleChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleArticleClick: () => void;
  handleArticleTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleArticleBodyChange: NonNullable<MDXEditorProps['onChange']>;
  handleEmojiSelect: (emoji: { native: string }) => void;
  handleFilesAdded: (files: File[]) => void;
  handleFileClick: () => void;
  removeExistingAttachment: (uri: string) => void;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handlePaste: (e: React.ClipboardEvent) => void;
  handleMentionSelect: (userId: string) => void;
  handleMentionKeyDown: (e: React.KeyboardEvent) => boolean;
}

import type { MDXEditorProps } from '@mdxeditor/editor';
import type React from 'react';

/**
 * Subset of `UsePostInputReturn` that the auth layer guards. Drag handlers are
 * intentionally absent: they are passed at call time to `handleDragEventWithAuth`.
 */
export interface UsePostInputAuthHandlersOptions {
  handleExpand: () => void;
  handleSubmit: () => Promise<void>;
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  setAttachments: React.Dispatch<React.SetStateAction<File[]>>;
  handleChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleFilesAdded: (files: File[]) => void;
  handleFileClick: () => void;
  handleEmojiSelect: (emoji: { native: string }) => void;
  handlePaste: (event: React.ClipboardEvent) => void;
  /** PostInput article mode only — omit in QuickReply. */
  handleArticleTitleChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleArticleBodyChange?: NonNullable<MDXEditorProps['onChange']>;
  handleArticleClick?: () => void;
}

export interface CreateKeyDownHandlerDeps {
  /** Returns true when the mention popover consumed the key event. */
  handleMentionKeyDown: (event: React.KeyboardEvent) => boolean;
  enterSubmitHandler: (event: React.KeyboardEvent) => void;
}

export interface UsePostInputAuthHandlersReturn {
  isAuthenticated: boolean;
  handleExpandWithAuth: () => void;
  handleSubmitWithAuth: () => Promise<void> | undefined;
  setTagsWithAuth: React.Dispatch<React.SetStateAction<string[]>>;
  setAttachmentsWithAuth: React.Dispatch<React.SetStateAction<File[]>>;
  handleChangeWithAuth: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleFilesAddedWithAuth: (files: File[]) => void;
  handleFileClickWithAuth: () => void;
  handleEmojiSelectWithAuth: (emoji: { native: string }) => void;
  handlePasteWithAuth: (event: React.ClipboardEvent) => void;
  handleDragEventWithAuth: (event: React.DragEvent, handler: (event: React.DragEvent) => void) => void;
  createKeyDownHandler: (deps: CreateKeyDownHandlerDeps) => (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Present only when the matching article handler is provided (PostInput). */
  handleArticleTitleChangeWithAuth?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleArticleBodyChangeWithAuth?: NonNullable<MDXEditorProps['onChange']>;
  handleArticleClickWithAuth?: () => void;
}

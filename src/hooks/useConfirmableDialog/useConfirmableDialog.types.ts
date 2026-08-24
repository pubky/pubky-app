export interface UseConfirmableDialogOptions {
  /** Callback to close the main dialog */
  onClose: () => void;
  /** Optional external content check — when provided, used instead of internal tracking */
  hasContent?: () => boolean;
}

export interface UseConfirmableDialogReturn {
  /** Whether the confirm discard dialog is visible */
  showConfirmDialog: boolean;
  /** Setter for confirm dialog visibility */
  setShowConfirmDialog: (show: boolean) => void;
  /** Key for resetting child components (e.g., PostInput) */
  resetKey: number;
  /** Handler for content changes - tracks content, tags, attachments, article title, and existing attachments (edit) */
  handleContentChange: (
    content: string,
    tags: string[],
    attachments: File[],
    articleTitle: string,
    existingAttachments?: unknown[],
  ) => void;
  /** Handler for dialog open/close - shows confirm dialog if there's unsaved content */
  handleOpenChange: (newOpen: boolean) => void;
  /** Handler for confirming discard - resets state and closes dialog */
  handleDiscard: () => void;
}

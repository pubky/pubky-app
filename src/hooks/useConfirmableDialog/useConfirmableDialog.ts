'use client';

import { useState, useRef } from 'react';
import type { UseConfirmableDialogOptions, UseConfirmableDialogReturn } from './useConfirmableDialog.types';

/**
 * Hook for managing dialog state with "confirm before discard" behavior.
 *
 * Encapsulates the logic for tracking unsaved content in dialogs and showing
 * a confirmation prompt when users try to close with unsaved changes.
 * Extracted to improve code organization and support reuse across similar
 * dialog patterns in the future.
 *
 * @param options - Configuration options
 * @returns Dialog state and handlers
 *
 * @example
 * ```tsx
 * const {
 *   showConfirmDialog,
 *   setShowConfirmDialog,
 *   resetKey,
 *   handleContentChange,
 *   handleOpenChange,
 *   handleDiscard,
 * } = useConfirmableDialog({
 *   onClose: () => setOpen(false),
 * });
 * ```
 */
export function useConfirmableDialog({
  onClose,
  hasContent: externalHasContent,
}: UseConfirmableDialogOptions): UseConfirmableDialogReturn {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const contentRef = useRef({ content: '', tags: [] as string[], attachments: [] as File[], articleTitle: '' });

  const internalHasContent = () => {
    return (
      contentRef.current.content.trim().length > 0 ||
      contentRef.current.tags.length > 0 ||
      contentRef.current.attachments.length > 0 ||
      contentRef.current.articleTitle.trim().length > 0
    );
  };

  const handleContentChange = (content: string, tags: string[], attachments: File[], articleTitle: string) => {
    contentRef.current = { content, tags, attachments, articleTitle };
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setShowConfirmDialog(false);
      contentRef.current = { content: '', tags: [], attachments: [], articleTitle: '' };
    } else {
      const contentExists = externalHasContent ? externalHasContent() : internalHasContent();
      if (contentExists) {
        setShowConfirmDialog(true);
      } else {
        onClose();
      }
    }
  };

  const handleDiscard = () => {
    setResetKey((prev) => prev + 1);
    setShowConfirmDialog(false);
    onClose();
  };

  return {
    showConfirmDialog,
    setShowConfirmDialog,
    resetKey,
    handleContentChange,
    handleOpenChange,
    handleDiscard,
  };
}

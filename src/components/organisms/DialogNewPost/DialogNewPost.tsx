'use client';

import { useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { useConfirmableDialog } from '@/hooks/useConfirmableDialog/useConfirmableDialog';
import { DialogConfirmDiscard } from '@/molecules/DialogConfirmDiscard/DialogConfirmDiscard';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { PostInput } from '../PostInput/PostInput';

interface DialogNewPostProps {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  /**
   * Optional side effect run after a post is created, before the dialog closes.
   * Receives the new post's composite id. Used by the FAB to save the post to a
   * collection / bookmarks and trigger an optimistic feed insert.
   */
  onPostCreated?: (createdPostId: string) => void | Promise<void>;
}

export function DialogNewPost({ open, onOpenChangeAction, onPostCreated }: DialogNewPostProps) {
  const [isArticle, setIsArticle] = useState(false);
  const [isLockEnabled, setIsLockEnabled] = useState(false);
  // A locked post is never an article, so the lock title wins.
  let title = 'New Post';
  if (isLockEnabled) {
    title = 'New Locked Post';
  } else if (isArticle) {
    title = 'New Article';
  }
  const { showConfirmDialog, setShowConfirmDialog, resetKey, handleContentChange, handleOpenChange, handleDiscard } =
    useConfirmableDialog({
      onClose: () => onOpenChangeAction(false),
      // With the lock switch on, the written body is held in lock state and the composer only shows
      // the (possibly empty) teaser — flag it so closing still prompts before discarding the draft.
      hasContent: () => isLockEnabled,
    });

  const handlePostSuccess = (createdPostId: string) => {
    void onPostCreated?.(createdPostId);
    onOpenChangeAction(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Articles get a wider dialog so the editor toolbar fits on one row on large displays */}
      <DialogContent avoidKeyboard className={isArticle ? 'w-4xl' : 'w-3xl'} hiddenTitle={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{`${title} dialog`}</DialogDescription>
        </DialogHeader>
        <Container className="gap-3">
          <PostInput
            dataCy="new-post-input"
            key={resetKey}
            variant={POST_INPUT_VARIANT.POST}
            onSuccess={handlePostSuccess}
            expanded={true}
            onContentChange={handleContentChange}
            onArticleModeChange={setIsArticle}
            onLockModeChange={setIsLockEnabled}
            layoutOverride="inline"
          />
        </Container>
        {/* Nested inside parent dialog to avoid mobile touch event issues with sibling portals */}
        <DialogConfirmDiscard
          open={showConfirmDialog}
          onOpenChange={() => setShowConfirmDialog(false)}
          onConfirm={handleDiscard}
        />
      </DialogContent>
    </Dialog>
  );
}

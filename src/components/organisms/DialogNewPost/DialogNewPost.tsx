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
  const title = isArticle ? 'New Article' : 'New Post';
  const { showConfirmDialog, setShowConfirmDialog, resetKey, handleContentChange, handleOpenChange, handleDiscard } =
    useConfirmableDialog({
      onClose: () => onOpenChangeAction(false),
    });

  const handlePostSuccess = (createdPostId: string) => {
    void onPostCreated?.(createdPostId);
    onOpenChangeAction(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent avoidKeyboard className="w-3xl" hiddenTitle={title}>
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

'use client';

import { useConfirmableDialog } from '@/hooks/useConfirmableDialog/useConfirmableDialog';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { DialogConfirmDiscard } from '@/molecules/DialogConfirmDiscard/DialogConfirmDiscard';
import { PostInput } from '../PostInput/PostInput';

import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import type { DialogRepostProps } from './DialogRepost.types';

export function DialogRepost({ postId, open, onOpenChangeAction }: DialogRepostProps) {
  const { showConfirmDialog, setShowConfirmDialog, resetKey, handleContentChange, handleOpenChange, handleDiscard } =
    useConfirmableDialog({
      onClose: () => onOpenChangeAction(false),
    });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-3xl" hiddenTitle="Repost">
        <DialogHeader>
          <DialogTitle>Repost</DialogTitle>
          <DialogDescription className="sr-only">Repost dialog</DialogDescription>
        </DialogHeader>
        <Container className="gap-3">
          {/* Repost input - repost preview is rendered inside PostInput */}
          <PostInput
            dataCy="repost-post-input"
            key={resetKey}
            variant={POST_INPUT_VARIANT.REPOST}
            originalPostId={postId}
            onSuccess={() => {
              onOpenChangeAction(false);
            }}
            showThreadConnector={false}
            expanded={true}
            onContentChange={handleContentChange}
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

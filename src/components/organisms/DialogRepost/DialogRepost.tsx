'use client';

import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { useConfirmableDialog } from '@/hooks/useConfirmableDialog/useConfirmableDialog';
import { DialogConfirmDiscard } from '@/molecules/DialogConfirmDiscard/DialogConfirmDiscard';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { PostInput } from '../PostInput/PostInput';
import type { DialogRepostProps } from './DialogRepost.types';

export function DialogRepost({ postId, open, onOpenChangeAction, config }: DialogRepostProps) {
  const { showConfirmDialog, setShowConfirmDialog, resetKey, handleContentChange, handleOpenChange, handleDiscard } =
    useConfirmableDialog({
      onClose: () => onOpenChangeAction(false),
    });

  const title = config?.title ?? 'Repost';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent avoidKeyboard className="w-3xl" hiddenTitle={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{`${title} dialog`}</DialogDescription>
        </DialogHeader>
        <Container className="gap-3">
          {/* Repost input - repost preview is rendered inside PostInput */}
          <PostInput
            dataCy="repost-post-input"
            key={resetKey}
            variant={POST_INPUT_VARIANT.REPOST}
            originalPostId={postId}
            submitLabel={config?.submitLabel}
            submitIcon={config?.submitIcon}
            successToastTitle={config?.successToastTitle}
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

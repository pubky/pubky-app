'use client';

import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { useConfirmableDialog } from '@/hooks/useConfirmableDialog/useConfirmableDialog';
import { DialogConfirmDiscard } from '@/molecules/DialogConfirmDiscard/DialogConfirmDiscard';
import { PostPreviewCard } from '@/molecules/PostPreviewCard/PostPreviewCard';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { scrollDialogTextareaIntoDialog } from '@/organisms/PostInput/PostInput.utils';
import { PostInput } from '../PostInput/PostInput';
import type { DialogReplyProps } from './DialogReply.types';

const REPLY_TEXTAREA_SELECTOR = '#reply-post-input [data-slot="textarea"]';

export function DialogReply({ postId, open, onOpenChangeAction }: DialogReplyProps) {
  const t = useTranslations('dialogs.reply');
  const { showConfirmDialog, setShowConfirmDialog, resetKey, handleContentChange, handleOpenChange, handleDiscard } =
    useConfirmableDialog({
      onClose: () => onOpenChangeAction(false),
    });

  //NOTE: This might refactor or improved in the future if we need it.
  // PostInput can handle this autoscrolling already but refactoring without need could impact in many other places.
  const handleDialogContentAnimationEnd: React.AnimationEventHandler<HTMLDivElement> = () => {
    if (!open) return;

    scrollDialogTextareaIntoDialog(REPLY_TEXTAREA_SELECTOR, 'smooth');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-3xl" hiddenTitle={t('hiddenTitle')} onAnimationEnd={handleDialogContentAnimationEnd}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('description')}</DialogDescription>
        </DialogHeader>
        <Container className="gap-3">
          {/* Post being replied to */}
          <PostPreviewCard postId={postId} />

          {/* Reply input */}
          <Container className="relative pl-6" overrideDefaults>
            <PostInput
              dataCy="reply-post-input"
              id="reply-post-input"
              key={resetKey}
              variant={POST_INPUT_VARIANT.REPLY}
              postId={postId}
              onSuccess={() => {
                onOpenChangeAction(false);
              }}
              showThreadConnector={true}
              expanded={true}
              autoFocusTextarea
              onContentChange={handleContentChange}
            />
          </Container>
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

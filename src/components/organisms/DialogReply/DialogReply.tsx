'use client';

import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { useConfirmableDialog } from '@/hooks/useConfirmableDialog/useConfirmableDialog';
import { DialogConfirmDiscard } from '@/molecules/DialogConfirmDiscard/DialogConfirmDiscard';
import { PostPreviewCard } from '@/molecules/PostPreviewCard/PostPreviewCard';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { PostInput } from '../PostInput/PostInput';
import type { DialogReplyProps } from './DialogReply.types';

export function DialogReply({ postId, open, onOpenChangeAction }: DialogReplyProps) {
  const t = useTranslations('dialogs.reply');
  const { showConfirmDialog, setShowConfirmDialog, resetKey, handleContentChange, handleOpenChange, handleDiscard } =
    useConfirmableDialog({
      onClose: () => onOpenChangeAction(false),
    });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        avoidKeyboard
        className="flex max-h-[calc(100dvh-2rem)] w-3xl flex-col"
        hiddenTitle={t('hiddenTitle')}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('description')}</DialogDescription>
        </DialogHeader>
        <Container className="min-h-0 flex-1 gap-3 overflow-x-hidden overscroll-contain pr-1">
          {/* Post being replied to */}
          <PostPreviewCard postId={postId} />

          {/* Reply input */}
          <Container className="relative w-full min-w-0 pl-6" overrideDefaults>
            <PostInput
              dataCy="reply-post-input"
              id="reply-post-input"
              key={resetKey}
              autoFocusTextarea
              variant={POST_INPUT_VARIANT.REPLY}
              postId={postId}
              onSuccess={() => {
                onOpenChangeAction(false);
              }}
              showThreadConnector={true}
              expanded={true}
              onContentChange={handleContentChange}
              layoutOverride="inline"
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

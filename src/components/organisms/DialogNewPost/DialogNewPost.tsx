'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { useConfirmableDialog } from '@/hooks/useConfirmableDialog/useConfirmableDialog';
import { DialogConfirmDiscard } from '@/molecules/DialogConfirmDiscard/DialogConfirmDiscard';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { PostInput } from '../PostInput/PostInput';
import type { DialogNewPostProps } from './DialogNewPost.types';

export function DialogNewPost({ open, onOpenChangeAction }: DialogNewPostProps) {
  const t = useTranslations('dialogs.newPost');
  const [isArticle, setIsArticle] = useState(false);
  const title = isArticle ? t('newArticle') : t('newPost');
  const { showConfirmDialog, setShowConfirmDialog, resetKey, handleContentChange, handleOpenChange, handleDiscard } =
    useConfirmableDialog({
      onClose: () => onOpenChangeAction(false),
    });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent avoidKeyboard className="w-3xl" hiddenTitle={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{t('description', { title })}</DialogDescription>
        </DialogHeader>
        <Container className="gap-3">
          <PostInput
            dataCy="new-post-input"
            key={resetKey}
            variant={POST_INPUT_VARIANT.POST}
            onSuccess={() => onOpenChangeAction(false)}
            expanded={true}
            onContentChange={handleContentChange}
            onArticleModeChange={setIsArticle}
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

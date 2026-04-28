'use client';

import { useConfirmableDialog } from '@/hooks/useConfirmableDialog/useConfirmableDialog';
import { useKeyboardOffset } from '@/hooks/useKeyboardOffset/useKeyboardOffset';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import type { DialogNewPostProps } from './DialogNewPost.types';
import { cn } from '@/libs/utils/utils';

export function DialogNewPost({ open, onOpenChangeAction }: DialogNewPostProps) {
  const t = useTranslations('dialogs.newPost');
  const [isArticle, setIsArticle] = useState(false);
  const title = isArticle ? t('newArticle') : t('newPost');
  const { showConfirmDialog, setShowConfirmDialog, resetKey, handleContentChange, handleOpenChange, handleDiscard } =
    useConfirmableDialog({
      onClose: () => onOpenChangeAction(false),
    });

  // Dialogs are already centered, so reduce the offset to avoid over-compensation
  const { isKeyboardVisible, keyboardOffset } = useKeyboardOffset({ offsetAdjustment: 200 });

  return (
    <Atoms.Dialog open={open} onOpenChange={handleOpenChange}>
      <Atoms.DialogContent
        className={cn('w-3xl', isKeyboardVisible && 'transition-transform duration-75')}
        style={
          isKeyboardVisible && keyboardOffset > 0
            ? {
                transform: `translateY(-${keyboardOffset}px)`,
              }
            : undefined
        }
        hiddenTitle={title}
      >
        <Atoms.DialogHeader>
          <Atoms.DialogTitle>{title}</Atoms.DialogTitle>
          <Atoms.DialogDescription className="sr-only">{t('description', { title })}</Atoms.DialogDescription>
        </Atoms.DialogHeader>
        <Atoms.Container className="gap-3">
          <Organisms.PostInput
            dataCy="new-post-input"
            key={resetKey}
            variant={POST_INPUT_VARIANT.POST}
            onSuccess={() => onOpenChangeAction(false)}
            expanded={true}
            onContentChange={handleContentChange}
            onArticleModeChange={setIsArticle}
          />
        </Atoms.Container>
        {/* Nested inside parent dialog to avoid mobile touch event issues with sibling portals */}
        <Molecules.DialogConfirmDiscard
          open={showConfirmDialog}
          onOpenChange={() => setShowConfirmDialog(false)}
          onConfirm={handleDiscard}
        />
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
}

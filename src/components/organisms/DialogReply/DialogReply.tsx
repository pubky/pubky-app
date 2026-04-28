'use client';

import { useConfirmableDialog } from '@/hooks/useConfirmableDialog/useConfirmableDialog';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { scrollDialogTextareaIntoDialog } from '@/organisms/PostInput/PostInput.utils';
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
    <Atoms.Dialog open={open} onOpenChange={handleOpenChange}>
      <Atoms.DialogContent
        className="w-3xl"
        hiddenTitle={t('hiddenTitle')}
        onAnimationEnd={handleDialogContentAnimationEnd}
      >
        <Atoms.DialogHeader>
          <Atoms.DialogTitle>{t('title')}</Atoms.DialogTitle>
          <Atoms.DialogDescription className="sr-only">{t('description')}</Atoms.DialogDescription>
        </Atoms.DialogHeader>
        <Atoms.Container className="gap-3">
          {/* Post being replied to */}
          <Molecules.PostPreviewCard postId={postId} />

          {/* Reply input */}
          <Atoms.Container className="relative pl-6" overrideDefaults>
            <Organisms.PostInput
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
          </Atoms.Container>
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

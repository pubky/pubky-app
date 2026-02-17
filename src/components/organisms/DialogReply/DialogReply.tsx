'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import type { DialogReplyProps } from './DialogReply.types';

export function DialogReply({ postId, open, onOpenChangeAction }: DialogReplyProps) {
  const t = useTranslations('dialogs.reply');
  const { showConfirmDialog, setShowConfirmDialog, resetKey, handleContentChange, handleOpenChange, handleDiscard } =
    Hooks.useConfirmableDialog({
      onClose: () => onOpenChangeAction(false),
    });

  return (
    <>
      <Molecules.DialogConfirmDiscard
        open={showConfirmDialog}
        onOpenChange={() => setShowConfirmDialog(false)}
        onConfirm={handleDiscard}
      />
      <Atoms.Dialog open={open} onOpenChange={handleOpenChange}>
        <Atoms.DialogContent className="w-3xl" hiddenTitle={t('hiddenTitle')}>
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
                key={resetKey}
                variant={POST_INPUT_VARIANT.REPLY}
                postId={postId}
                onSuccess={() => {
                  onOpenChangeAction(false);
                }}
                showThreadConnector={true}
                expanded={true}
                onContentChange={handleContentChange}
              />
            </Atoms.Container>
          </Atoms.Container>
        </Atoms.DialogContent>
      </Atoms.Dialog>
    </>
  );
}

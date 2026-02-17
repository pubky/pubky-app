'use client';

import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import type { DialogRepostProps } from './DialogRepost.types';

export function DialogRepost({ postId, open, onOpenChangeAction }: DialogRepostProps) {
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
        <Atoms.DialogContent className="w-3xl" hiddenTitle="Repost">
          <Atoms.DialogHeader>
            <Atoms.DialogTitle>Repost</Atoms.DialogTitle>
            <Atoms.DialogDescription className="sr-only">Repost dialog</Atoms.DialogDescription>
          </Atoms.DialogHeader>
          <Atoms.Container className="gap-3">
            {/* Repost input - repost preview is rendered inside PostInput */}
            <Organisms.PostInput
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
          </Atoms.Container>
        </Atoms.DialogContent>
      </Atoms.Dialog>
    </>
  );
}

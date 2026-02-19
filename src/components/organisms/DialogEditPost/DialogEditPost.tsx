'use client';

import { Dispatch, SetStateAction } from 'react';
import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';

interface DialogEditPostProps {
  open: boolean;
  onOpenChangeAction: Dispatch<SetStateAction<boolean>>;
  postId: string;
}

export function DialogEditPost({ open, onOpenChangeAction, postId }: DialogEditPostProps) {
  const { showConfirmDialog, setShowConfirmDialog, resetKey, handleContentChange, handleOpenChange, handleDiscard } =
    Hooks.useConfirmableDialog({
      onClose: () => onOpenChangeAction(false),
    });

  const { postDetails } = Hooks.usePostDetails(postId);

  if (!postDetails) return null;

  const isArticle = postDetails.kind === 'long';
  const title = isArticle ? 'Edit Article' : 'Edit Post';

  return (
    <Atoms.Dialog open={open} onOpenChange={handleOpenChange}>
      <Atoms.DialogContent
        className="w-3xl"
        hiddenTitle={title}
        onOpenAutoFocus={(e) => {
          if (isArticle) {
            e.preventDefault();
          }
        }}
      >
        <Atoms.DialogHeader>
          <Atoms.DialogTitle>{title}</Atoms.DialogTitle>

          <Atoms.DialogDescription className="sr-only">{title} dialog</Atoms.DialogDescription>
        </Atoms.DialogHeader>

        <Organisms.PostInput
          dataCy="edit-post-input"
          key={resetKey}
          variant={POST_INPUT_VARIANT.EDIT}
          onSuccess={() => onOpenChangeAction(false)}
          expanded={true}
          onContentChange={handleContentChange}
          editPostId={postDetails.id}
          editContent={postDetails.content}
          editIsArticle={isArticle}
        />
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

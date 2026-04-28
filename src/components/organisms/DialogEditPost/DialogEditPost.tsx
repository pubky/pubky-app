'use client';

import { useConfirmableDialog } from '@/hooks/useConfirmableDialog/useConfirmableDialog';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { Dispatch, SetStateAction } from 'react';
import * as Atoms from '@/atoms';
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
    useConfirmableDialog({
      onClose: () => onOpenChangeAction(false),
    });

  const { postDetails } = usePostDetails(postId);

  if (!postDetails) return null;

  const isArticle = postDetails.kind === 'long';
  const title = isArticle ? 'Edit Article' : 'Edit Post';

  return (
    <Atoms.Dialog open={open} onOpenChange={handleOpenChange}>
      <Atoms.DialogContent className="w-3xl" hiddenTitle={title}>
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
          autoFocusTextarea={!isArticle}
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

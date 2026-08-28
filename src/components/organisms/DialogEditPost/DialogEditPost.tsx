'use client';

import { Dispatch, SetStateAction, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { useConfirmableDialog } from '@/hooks/useConfirmableDialog/useConfirmableDialog';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { isArticleContent } from '@/libs/post/articleContent';
import { DialogConfirmDiscard } from '@/molecules/DialogConfirmDiscard/DialogConfirmDiscard';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { PostInput } from '../PostInput/PostInput';

interface DialogEditPostProps {
  open: boolean;
  onOpenChangeAction: Dispatch<SetStateAction<boolean>>;
  postId: string;
}

export function DialogEditPost({ open, onOpenChangeAction, postId }: DialogEditPostProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showConfirmDialog, setShowConfirmDialog, resetKey, handleContentChange, handleOpenChange, handleDiscard } =
    useConfirmableDialog({
      onClose: () => onOpenChangeAction(false),
    });

  // Closing mid-commit could strand a save that references session uploads;
  // the commit takes a moment and the submit button shows it
  const handleOpenChangeGuarded = (nextOpen: boolean) => {
    if (!nextOpen && isSubmitting) return;
    handleOpenChange(nextOpen);
  };

  const { postDetails } = usePostDetails(postId);

  if (!postDetails) return null;

  const isArticle = postDetails.kind === 'long' && isArticleContent(postDetails.content);
  const title = isArticle ? 'Edit Article' : 'Edit Post';

  return (
    <Dialog open={open} onOpenChange={handleOpenChangeGuarded}>
      {/* Articles get a wider dialog so the editor toolbar fits on one row on large displays */}
      <DialogContent avoidKeyboard className={isArticle ? 'w-4xl' : 'w-3xl'} hiddenTitle={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>

          <DialogDescription className="sr-only">{title} dialog</DialogDescription>
        </DialogHeader>

        <PostInput
          dataCy="edit-post-input"
          key={resetKey}
          variant={POST_INPUT_VARIANT.EDIT}
          onSuccess={() => onOpenChangeAction(false)}
          expanded={true}
          autoFocusTextarea={!isArticle}
          onContentChange={handleContentChange}
          onSubmittingChange={setIsSubmitting}
          editPostId={postDetails.id}
          editContent={postDetails.content}
          editIsArticle={isArticle}
          editAttachments={postDetails.attachments ?? []}
          layoutOverride="inline"
        />
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

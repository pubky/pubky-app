'use client';

import { Dispatch, SetStateAction } from 'react';
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
  const { showConfirmDialog, setShowConfirmDialog, resetKey, handleContentChange, handleOpenChange, handleDiscard } =
    useConfirmableDialog({
      onClose: () => onOpenChangeAction(false),
    });

  const { postDetails } = usePostDetails(postId);

  if (!postDetails) return null;

  // TODO:[Locks] #2312 — a lock announcement is `short`, so it misses this branch and its teaser
  // envelope reaches the textarea as raw JSON. Needs a dedicated dialog once the post model carries
  // `lock` (#2027) — collections route the same way.
  const isArticle = postDetails.kind === 'long' && isArticleContent(postDetails.content);
  const title = isArticle ? 'Edit Article' : 'Edit Post';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent avoidKeyboard className="w-3xl" hiddenTitle={title}>
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
          editPostId={postDetails.id}
          editContent={postDetails.content}
          editIsArticle={isArticle}
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

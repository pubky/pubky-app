'use client';

import { Dispatch, SetStateAction } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { LocksController } from '@/controllers/locks/locks';
import { useConfirmableDialog } from '@/hooks/useConfirmableDialog/useConfirmableDialog';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { isArticleContent } from '@/libs/post/articleContent';
import { isEditableLockTeaserContent } from '@/libs/post/lockTeaser';
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

  const lockUrl = postDetails.lock;
  const parsedTeaser = lockUrl ? LocksController.getLockContent(postDetails.content) : null;
  const teaser = parsedTeaser && isEditableLockTeaserContent(postDetails.content) ? parsedTeaser : null;
  const isArticle = postDetails.kind === 'long' && isArticleContent(postDetails.content);
  const title = isArticle ? 'Edit Article' : 'Edit Post';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
          editPostId={postDetails.id}
          editContent={teaser ? teaser.teaser_description : postDetails.content}
          editIsArticle={isArticle}
          editAttachments={postDetails.attachments ?? []}
          editLock={lockUrl && teaser ? { lockUrl, title: teaser.lock_title } : undefined}
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

'use client';

import { DialogReply } from '../DialogReply/DialogReply';
import { DialogRepost } from '../DialogRepost/DialogRepost';

interface PostReplyRepostDialogsProps {
  postId: string;
  replyDialogOpen: boolean;
  repostDialogOpen: boolean;
  onReplyDialogOpenChange: (open: boolean) => void;
  onRepostDialogOpenChange: (open: boolean) => void;
}

export function PostReplyRepostDialogs({
  postId,
  replyDialogOpen,
  repostDialogOpen,
  onReplyDialogOpenChange,
  onRepostDialogOpenChange,
}: PostReplyRepostDialogsProps) {
  return (
    <>
      <DialogReply postId={postId} open={replyDialogOpen} onOpenChangeAction={onReplyDialogOpenChange} />
      <DialogRepost postId={postId} open={repostDialogOpen} onOpenChangeAction={onRepostDialogOpenChange} />
    </>
  );
}

'use client';

import { useState } from 'react';
import { DialogReply } from '@/organisms/DialogReply/DialogReply';
import { DialogRepost } from '@/organisms/DialogRepost/DialogRepost';

export function usePostReplyRepostDialogs(postId: string) {
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [repostDialogOpen, setRepostDialogOpen] = useState(false);

  const openReplyDialog = () => {
    setReplyDialogOpen(true);
  };

  const openRepostDialog = () => {
    setRepostDialogOpen(true);
  };

  return {
    openReplyDialog,
    openRepostDialog,
    dialogs: (
      <>
        <DialogReply postId={postId} open={replyDialogOpen} onOpenChangeAction={setReplyDialogOpen} />
        <DialogRepost postId={postId} open={repostDialogOpen} onOpenChangeAction={setRepostDialogOpen} />
      </>
    ),
  };
}

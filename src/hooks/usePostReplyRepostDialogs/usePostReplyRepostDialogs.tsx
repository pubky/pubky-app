'use client';

import { useState } from 'react';
import { DialogReply } from '@/organisms/DialogReply/DialogReply';
import { DialogRepost } from '@/organisms/DialogRepost/DialogRepost';

export function usePostReplyRepostDialogs(postId: string) {
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [repostDialogOpen, setRepostDialogOpen] = useState(false);
  const [dialogPostId, setDialogPostId] = useState(postId);

  const openReplyDialog = (targetPostId = postId) => {
    setDialogPostId(targetPostId);
    setReplyDialogOpen(true);
  };

  const openRepostDialog = (targetPostId = postId) => {
    setDialogPostId(targetPostId);
    setRepostDialogOpen(true);
  };

  const activeDialogPostId = replyDialogOpen || repostDialogOpen ? dialogPostId : postId;

  return {
    openReplyDialog,
    openRepostDialog,
    dialogs: (
      <>
        <DialogReply postId={activeDialogPostId} open={replyDialogOpen} onOpenChangeAction={setReplyDialogOpen} />
        <DialogRepost postId={activeDialogPostId} open={repostDialogOpen} onOpenChangeAction={setRepostDialogOpen} />
      </>
    ),
  };
}

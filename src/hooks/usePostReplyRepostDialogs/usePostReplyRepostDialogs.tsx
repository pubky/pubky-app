'use client';

import { useState } from 'react';
import { DialogReply } from '@/organisms/DialogReply/DialogReply';
import { DialogRepost } from '@/organisms/DialogRepost/DialogRepost';
import type { DialogRepostConfig } from '@/organisms/DialogRepost/DialogRepost.types';

export function usePostReplyRepostDialogs(postId: string, repostConfig?: DialogRepostConfig) {
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
        <DialogRepost
          postId={activeDialogPostId}
          open={repostDialogOpen}
          onOpenChangeAction={setRepostDialogOpen}
          config={repostConfig}
        />
      </>
    ),
  };
}

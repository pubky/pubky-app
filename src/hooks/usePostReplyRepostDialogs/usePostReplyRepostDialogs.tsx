'use client';

import { useState } from 'react';
import { DialogReply } from '@/organisms/DialogReply/DialogReply';
import { DialogRepost } from '@/organisms/DialogRepost/DialogRepost';
import type { DialogRepostConfig } from '@/organisms/DialogRepost/DialogRepost.types';

export function usePostReplyRepostDialogs(postId: string, repostConfig?: DialogRepostConfig) {
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
        <DialogRepost
          postId={postId}
          open={repostDialogOpen}
          onOpenChangeAction={setRepostDialogOpen}
          config={repostConfig}
        />
      </>
    ),
  };
}

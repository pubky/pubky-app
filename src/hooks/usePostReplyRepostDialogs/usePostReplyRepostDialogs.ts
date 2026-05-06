'use client';

import { useState } from 'react';

export function usePostReplyRepostDialogs() {
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [repostDialogOpen, setRepostDialogOpen] = useState(false);

  const openReplyDialog = () => {
    setReplyDialogOpen(true);
  };

  const openRepostDialog = () => {
    setRepostDialogOpen(true);
  };

  return {
    replyDialogOpen,
    repostDialogOpen,
    setReplyDialogOpen,
    setRepostDialogOpen,
    openReplyDialog,
    openRepostDialog,
  };
}

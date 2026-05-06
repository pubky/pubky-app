'use client';

import { useCallback, useState } from 'react';

export function usePostReplyRepostDialogs() {
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [repostDialogOpen, setRepostDialogOpen] = useState(false);

  const openReplyDialog = useCallback(() => {
    setReplyDialogOpen(true);
  }, []);

  const openRepostDialog = useCallback(() => {
    setRepostDialogOpen(true);
  }, []);

  return {
    replyDialogOpen,
    repostDialogOpen,
    setReplyDialogOpen,
    setRepostDialogOpen,
    openReplyDialog,
    openRepostDialog,
  };
}

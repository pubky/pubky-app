'use client';

import { Trash2 } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';

interface DialogConfirmDeleteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /**
   * Dialog title. Defaults to the delete-post copy; collections pass
   * 'Delete collection?'.
   */
  title?: string;
  /**
   * Dialog body. Defaults to the delete-post copy; collections pass
   * caller-side interpolated copy.
   */
  description?: string;
}
export function DialogConfirmDelete({
  open,
  onOpenChange,
  onConfirm,
  title = 'Delete post?',
  description = 'This action cannot be undone. The post will be permanently deleted.',
}: DialogConfirmDeleteProps) {
  const handleDelete = () => {
    onConfirm();
    onOpenChange(false);
  };
  const handleCancel = () => {
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-xl" hiddenTitle={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Typography className="text-base tracking-wide text-white/80">{description}</Typography>
        <DialogFooter>
          <Button variant="destructive" size="lg" onClick={handleDelete} data-cy="dialog-confirm-delete-btn">
            <Trash2 className="h-4 w-4" />
            {'Delete'}
          </Button>
          <Button variant="outline" size="lg" onClick={handleCancel}>
            {'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

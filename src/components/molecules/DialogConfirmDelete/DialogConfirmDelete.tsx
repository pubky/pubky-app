'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';

interface DialogConfirmDeleteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | boolean | Promise<void | boolean>;
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
  /** A line shown above the buttons, with a secondary Sign in button when `onSignIn` is set. */
  signInNotice?: string;
  onSignIn?: () => void;
}
export function DialogConfirmDelete({
  open,
  onOpenChange,
  onConfirm,
  title = 'Delete post?',
  description = 'This action cannot be undone. The post will be permanently deleted.',
  signInNotice,
  onSignIn,
}: DialogConfirmDeleteProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const inFlight = useRef(false);
  const handleDelete = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsDeleting(true);
    try {
      if ((await onConfirm()) !== false) onOpenChange(false);
    } finally {
      inFlight.current = false;
      setIsDeleting(false);
    }
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
        <Typography className="text-base tracking-wide text-foreground/80">{description}</Typography>
        {signInNotice && onSignIn && (
          <div className="flex items-center justify-between gap-4">
            <Typography className="text-sm text-destructive">{signInNotice}</Typography>
            <Button variant="secondary" size="sm" onClick={onSignIn} data-cy="dialog-confirm-delete-sign-in">
              {'Sign in'}
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="destructive"
            size="lg"
            onClick={handleDelete}
            disabled={isDeleting}
            data-cy="dialog-confirm-delete-btn"
          >
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

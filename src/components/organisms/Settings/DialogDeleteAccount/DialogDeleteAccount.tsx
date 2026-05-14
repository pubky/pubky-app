'use client';
import { Trash2 } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';

interface DialogDeleteAccountProps {
  isOpen: boolean;
  onOpenChangeAction: (open: boolean) => void;
  onDeleteAccount?: () => void;
}
export function DialogDeleteAccount({ isOpen, onOpenChangeAction }: DialogDeleteAccountProps) {
  const handleDeleteAccount = () => {
    onOpenChangeAction(false);
  };
  const handleCancel = () => {
    onOpenChangeAction(false);
  };
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChangeAction}>
      <DialogContent className="max-w-md sm:max-w-lg" hiddenTitle="Delete Account">
        <DialogHeader>
          <DialogTitle>Delete Account</DialogTitle>
        </DialogHeader>
        <Typography className="text-base leading-6 font-normal tracking-wide text-white/80">
          Are you sure? Your account information cannot be recovered.
        </Typography>
        <DialogFooter>
          <Button
            id="delete-account-confirm-btn"
            variant="destructive"
            size="lg"
            onClick={handleDeleteAccount}
            className="order-1 sm:order-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete Account
          </Button>
          <Button variant="outline" size="lg" onClick={handleCancel} className="order-2 sm:order-1">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import * as Atoms from '@/atoms';
import * as Libs from '@/libs';

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
    <Atoms.Dialog open={isOpen} onOpenChange={onOpenChangeAction}>
      <Atoms.DialogContent className="max-w-md sm:max-w-lg" hiddenTitle="Delete Account">
        <Atoms.DialogHeader>
          <Atoms.DialogTitle>Delete Account</Atoms.DialogTitle>
        </Atoms.DialogHeader>
        <Atoms.Typography className="text-base leading-6 font-normal tracking-wide text-white/80">
          Are you sure? Your account information cannot be recovered.
        </Atoms.Typography>
        <Atoms.DialogFooter>
          <Atoms.Button
            id="delete-account-confirm-btn"
            variant="destructive"
            size="lg"
            onClick={handleDeleteAccount}
            className="order-1 sm:order-2"
          >
            <Libs.Trash2 className="h-4 w-4" />
            Delete Account
          </Atoms.Button>
          <Atoms.Button variant="outline" size="lg" onClick={handleCancel} className="order-2 sm:order-1">
            Cancel
          </Atoms.Button>
        </Atoms.DialogFooter>
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
}

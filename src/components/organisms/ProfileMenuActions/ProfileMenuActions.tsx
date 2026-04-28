'use client';

import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useState } from 'react';
import * as Atoms from '@/atoms';
import { MENU_VARIANT } from '@/config/ui';
import { ProfileMenuActionsContent } from './ProfileMenuActionsContent';
import type { ProfileMenuActionsProps } from './ProfileMenuActions.types';

export function ProfileMenuActions({ userId, trigger }: ProfileMenuActionsProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { requireAuth } = useRequireAuth();
  const closeMenu = () => setOpen(false);

  // Handle open/close with auth check - opens sign-in dialog for unauthenticated users
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      requireAuth(() => setOpen(true));
    } else {
      setOpen(false);
    }
  };

  return (
    <>
      {isMobile ? (
        <Atoms.Sheet open={open} onOpenChange={handleOpenChange}>
          <Atoms.SheetTrigger asChild>{trigger}</Atoms.SheetTrigger>
          <Atoms.SheetContent side="bottom" onOpenAutoFocus={(e) => e.preventDefault()}>
            <Atoms.SheetHeader>
              <Atoms.SheetTitle className="sr-only">Profile Actions</Atoms.SheetTitle>
            </Atoms.SheetHeader>
            <Atoms.Container overrideDefaults className="flex flex-col gap-2">
              <ProfileMenuActionsContent userId={userId} variant={MENU_VARIANT.SHEET} onActionComplete={closeMenu} />
            </Atoms.Container>
          </Atoms.SheetContent>
        </Atoms.Sheet>
      ) : (
        <Atoms.DropdownMenu open={open} onOpenChange={handleOpenChange}>
          <Atoms.DropdownMenuTrigger asChild>{trigger}</Atoms.DropdownMenuTrigger>
          <Atoms.DropdownMenuContent
            align="end"
            className="flex w-56 flex-col gap-2.5"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <ProfileMenuActionsContent userId={userId} variant={MENU_VARIANT.DROPDOWN} onActionComplete={closeMenu} />
          </Atoms.DropdownMenuContent>
        </Atoms.DropdownMenu>
      )}
    </>
  );
}

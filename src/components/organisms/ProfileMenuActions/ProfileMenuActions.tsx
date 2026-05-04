'use client';

import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/atoms/DropdownMenu/DropdownMenu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/atoms/Sheet/Sheet';

import { MENU_VARIANT } from '@/config/ui';
import { ProfileMenuActionsContent } from './ProfileMenuActionsContent/ProfileMenuActionsContent';

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
        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetTrigger asChild>{trigger}</SheetTrigger>
          <SheetContent side="bottom" onOpenAutoFocus={(e) => e.preventDefault()}>
            <SheetHeader>
              <SheetTitle className="sr-only">Profile Actions</SheetTitle>
            </SheetHeader>
            <Container overrideDefaults className="flex flex-col gap-2">
              <ProfileMenuActionsContent userId={userId} variant={MENU_VARIANT.SHEET} onActionComplete={closeMenu} />
            </Container>
          </SheetContent>
        </Sheet>
      ) : (
        <DropdownMenu open={open} onOpenChange={handleOpenChange}>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="flex w-56 flex-col gap-2.5"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <ProfileMenuActionsContent userId={userId} variant={MENU_VARIANT.DROPDOWN} onActionComplete={closeMenu} />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}

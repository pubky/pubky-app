'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import { MENU_VARIANT } from '@/config/ui';
import * as Hooks from '@/hooks';
import * as Organisms from '@/organisms';
import { PostMenuActionsContent } from './PostMenuActionsContent';
import type { PostMenuActionsProps } from './PostMenuActions.types';

export function PostMenuActions({ postId, trigger }: PostMenuActionsProps) {
  const t = useTranslations('post.actions');
  const isMobile = Hooks.useIsMobile();
  const [open, setOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const { requireAuth } = Hooks.useRequireAuth();
  const closeMenu = () => setOpen(false);

  const handleReportClick = () => {
    closeMenu();
    setReportDialogOpen(true);
  };

  const handleEditClick = () => {
    setEditDialogOpen(true);
  };

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
              <Atoms.SheetTitle className="sr-only">{t('title')}</Atoms.SheetTitle>
            </Atoms.SheetHeader>
            <Atoms.Container overrideDefaults className="flex flex-col gap-2">
              <PostMenuActionsContent
                postId={postId}
                variant={MENU_VARIANT.SHEET}
                onActionComplete={closeMenu}
                onReportClick={handleReportClick}
                onEditClick={handleEditClick}
              />
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
            <PostMenuActionsContent
              postId={postId}
              variant={MENU_VARIANT.DROPDOWN}
              onActionComplete={closeMenu}
              onReportClick={handleReportClick}
              onEditClick={handleEditClick}
            />
          </Atoms.DropdownMenuContent>
        </Atoms.DropdownMenu>
      )}
      <Organisms.DialogReportPost open={reportDialogOpen} onOpenChange={setReportDialogOpen} postId={postId} />
      <Organisms.DialogEditPost open={editDialogOpen} onOpenChangeAction={setEditDialogOpen} postId={postId} />
    </>
  );
}

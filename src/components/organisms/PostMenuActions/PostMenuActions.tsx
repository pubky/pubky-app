'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/atoms/DropdownMenu/DropdownMenu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/atoms/Sheet/Sheet';
import { MENU_VARIANT } from '@/config/ui';
import { useDeletePost } from '@/hooks/useDeletePost/useDeletePost';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { DialogConfirmDelete } from '@/molecules/DialogConfirmDelete/DialogConfirmDelete';
import { DialogEditPost } from '../DialogEditPost/DialogEditPost';
import { DialogReportPost } from '../DialogReportPost/DialogReportPost';
import { EditCollectionDialog } from '../EditCollectionDialog/EditCollectionDialog';
import type { PostMenuActionsProps } from './PostMenuActions.types';
import { PostMenuActionsContent } from './PostMenuActionsContent/PostMenuActionsContent';

export function PostMenuActions({ postId, trigger }: PostMenuActionsProps) {
  const t = useTranslations('post.actions');
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { deletePost, isDeleting } = useDeletePost();
  const { requireAuth } = useRequireAuth();
  const { postDetails } = usePostDetails(postId);
  // Collection posts use a dedicated form dialog because their content is a
  // structured envelope (name/description/cover), unlike the free-form text /
  // article content handled by DialogEditPost.
  const isCollection = postDetails?.kind === 'collection';
  const closeMenu = () => setOpen(false);

  const handleReportClick = () => {
    closeMenu();
    setReportDialogOpen(true);
  };

  const handleEditClick = () => {
    setEditDialogOpen(true);
  };

  const handleDeleteClick = () => {
    closeMenu();
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    deletePost(postId);
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
        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetTrigger asChild>{trigger}</SheetTrigger>
          <SheetContent side="bottom" onOpenAutoFocus={(e) => e.preventDefault()}>
            <SheetHeader>
              <SheetTitle className="sr-only">{t('title')}</SheetTitle>
            </SheetHeader>
            <Container overrideDefaults className="flex flex-col gap-2">
              <PostMenuActionsContent
                postId={postId}
                variant={MENU_VARIANT.SHEET}
                onActionComplete={closeMenu}
                onReportClick={handleReportClick}
                onEditClick={handleEditClick}
                onDeleteClick={handleDeleteClick}
                isDeleting={isDeleting}
              />
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
            <PostMenuActionsContent
              postId={postId}
              variant={MENU_VARIANT.DROPDOWN}
              onActionComplete={closeMenu}
              onReportClick={handleReportClick}
              onEditClick={handleEditClick}
              onDeleteClick={handleDeleteClick}
              isDeleting={isDeleting}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <DialogReportPost open={reportDialogOpen} onOpenChange={setReportDialogOpen} postId={postId} />
      {isCollection ? (
        <EditCollectionDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} compositeCollectionId={postId} />
      ) : (
        <DialogEditPost open={editDialogOpen} onOpenChangeAction={setEditDialogOpen} postId={postId} />
      )}
      <DialogConfirmDelete
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}

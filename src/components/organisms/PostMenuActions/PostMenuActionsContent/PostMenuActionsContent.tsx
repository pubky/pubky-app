'use client';

import { usePostMenuActions } from '@/hooks/usePostMenuActions/usePostMenuActions';
import { PostMenuActionList } from '../PostMenuActionList/PostMenuActionList';
import { PostMenuActionsContentSkeleton } from './PostMenuActionsContent.skeleton';
import type { PostMenuActionsContentProps } from './PostMenuActionsContent.types';

export function PostMenuActionsContent({
  postId,
  active = true,
  variant,
  onActionComplete,
  onReportClick,
  onEditClick,
  onDeleteClick,
  isDeleting,
}: PostMenuActionsContentProps) {
  const { menuItems, isLoading } = usePostMenuActions(postId, {
    active,
    onReportClick,
    onEditClick,
    onDeleteClick,
    isDeleting,
  });

  if (isLoading) {
    return <PostMenuActionsContentSkeleton />;
  }

  return <PostMenuActionList items={menuItems} variant={variant} onActionComplete={onActionComplete} />;
}

'use client';

import { usePostMenuActions } from '@/hooks/usePostMenuActions/usePostMenuActions';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { DropdownMenuItem } from '@/atoms/DropdownMenu/DropdownMenu';
import { Typography } from '@/atoms/Typography/Typography';

import { MENU_VARIANT } from '@/config/ui';
import { PostMenuActionsContentSkeleton } from './PostMenuActionsContent.skeleton';
import type { PostMenuActionsContentProps } from './PostMenuActionsContent.types';
import { cn } from '@/libs/utils/utils';

export function PostMenuActionsContent({
  postId,
  variant,
  onActionComplete,
  onReportClick,
  onEditClick,
  onDeleteClick,
  isDeleting,
}: PostMenuActionsContentProps) {
  const { menuItems, isLoading } = usePostMenuActions(postId, {
    onReportClick,
    onEditClick,
    onDeleteClick,
    isDeleting,
  });

  if (isLoading) {
    return <PostMenuActionsContentSkeleton />;
  }

  const handleItemClick = async (item: (typeof menuItems)[0]) => {
    await item.onClick();
    onActionComplete();
  };

  return (
    <>
      {menuItems.map((item) => {
        const Icon = item.icon;
        const color = item.variant === 'destructive' ? 'text-destructive' : 'text-muted-foreground';

        return variant === MENU_VARIANT.SHEET ? (
          <Button
            key={item.id}
            data-cy={`post-menu-action-${item.id}`}
            variant="ghost"
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            className="justify-start overflow-hidden"
          >
            <Container overrideDefaults className="flex items-center gap-2 overflow-hidden">
              <Icon className={cn('size-4 shrink-0', color)} />
              <Typography as="span" overrideDefaults className={cn('truncate text-base font-medium', color)}>
                {item.label}
              </Typography>
            </Container>
          </Button>
        ) : (
          <DropdownMenuItem
            key={item.id}
            data-cy={`post-menu-action-${item.id}`}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            className="group p-0"
          >
            <Container overrideDefaults className="flex items-center gap-2 overflow-hidden p-0">
              <Icon className={cn('size-4 shrink-0 transition-colors', color, 'group-hover:text-foreground')} />
              <Typography
                as="span"
                overrideDefaults
                className={cn('truncate text-base font-medium transition-colors', color, 'group-hover:text-foreground')}
              >
                {item.label}
              </Typography>
            </Container>
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

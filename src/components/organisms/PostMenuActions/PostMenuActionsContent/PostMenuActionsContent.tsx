'use client';

import * as Atoms from '@/atoms';
import { MENU_VARIANT } from '@/config/ui';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';
import { PostMenuActionsContentSkeleton } from './PostMenuActionsContent.skeleton';
import type { PostMenuActionsContentProps } from './PostMenuActionsContent.types';

export function PostMenuActionsContent({
  postId,
  variant,
  onActionComplete,
  onReportClick,
  onEditClick,
  onDeleteClick,
  isDeleting,
}: PostMenuActionsContentProps) {
  const { menuItems, isLoading } = Hooks.usePostMenuActions(postId, {
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
          <Atoms.Button
            key={item.id}
            data-cy={`post-menu-action-${item.id}`}
            variant="ghost"
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            className="justify-start overflow-hidden"
          >
            <Atoms.Container overrideDefaults className="flex items-center gap-2 overflow-hidden">
              <Icon className={Libs.cn('size-4 shrink-0', color)} />
              <Atoms.Typography as="span" overrideDefaults className={Libs.cn('truncate text-base font-medium', color)}>
                {item.label}
              </Atoms.Typography>
            </Atoms.Container>
          </Atoms.Button>
        ) : (
          <Atoms.DropdownMenuItem
            key={item.id}
            data-cy={`post-menu-action-${item.id}`}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            className="group p-0"
          >
            <Atoms.Container overrideDefaults className="flex items-center gap-2 overflow-hidden p-0">
              <Icon className={Libs.cn('size-4 shrink-0 transition-colors', color, 'group-hover:text-foreground')} />
              <Atoms.Typography
                as="span"
                overrideDefaults
                className={Libs.cn(
                  'truncate text-base font-medium transition-colors',
                  color,
                  'group-hover:text-foreground',
                )}
              >
                {item.label}
              </Atoms.Typography>
            </Atoms.Container>
          </Atoms.DropdownMenuItem>
        );
      })}
    </>
  );
}

'use client';

import { useProfileMenuActions } from '@/hooks/useProfileMenuActions/useProfileMenuActions';
import * as Atoms from '@/atoms';
import { MENU_VARIANT } from '@/config/ui';
import { ProfileMenuActionsContentSkeleton } from './ProfileMenuActionsContent.skeleton';
import type { ProfileMenuActionsContentProps } from './ProfileMenuActionsContent.types';

export function ProfileMenuActionsContent({ userId, variant, onActionComplete }: ProfileMenuActionsContentProps) {
  const { menuItems, isLoading } = useProfileMenuActions(userId);

  if (isLoading) {
    return <ProfileMenuActionsContentSkeleton />;
  }

  const handleItemClick = async (item: (typeof menuItems)[0]) => {
    try {
      await item.onClick();
    } finally {
      onActionComplete();
    }
  };

  return (
    <>
      {menuItems.map((item) => {
        const Icon = item.icon;

        return variant === MENU_VARIANT.SHEET ? (
          <Atoms.Button
            key={item.id}
            data-cy={`profile-menu-action-${item.id}`}
            variant="ghost"
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            className="justify-start overflow-hidden"
          >
            <Atoms.Container overrideDefaults className="flex items-center gap-2 overflow-hidden">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <Atoms.Typography
                as="span"
                overrideDefaults
                className="truncate text-base font-medium text-muted-foreground"
              >
                {item.label}
              </Atoms.Typography>
            </Atoms.Container>
          </Atoms.Button>
        ) : (
          <Atoms.DropdownMenuItem
            key={item.id}
            data-cy={`profile-menu-action-${item.id}`}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            className="group p-0"
          >
            <Atoms.Container overrideDefaults className="flex items-center gap-2 overflow-hidden p-0">
              <Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              <Atoms.Typography
                as="span"
                overrideDefaults
                className="truncate text-base font-medium text-muted-foreground transition-colors group-hover:text-foreground"
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

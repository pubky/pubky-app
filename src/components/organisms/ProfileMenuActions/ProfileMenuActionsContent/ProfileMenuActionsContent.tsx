'use client';

import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { DropdownMenuItem } from '@/atoms/DropdownMenu/DropdownMenu';
import { Typography } from '@/atoms/Typography/Typography';
import { MENU_VARIANT } from '@/config/ui';
import { useProfileMenuActions } from '@/hooks/useProfileMenuActions/useProfileMenuActions';
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
          <Button
            key={item.id}
            data-cy={`profile-menu-action-${item.id}`}
            variant="ghost"
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            className="justify-start overflow-hidden"
          >
            <Container overrideDefaults className="flex items-center gap-2 overflow-hidden">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <Typography as="span" overrideDefaults className="truncate text-base font-medium text-muted-foreground">
                {item.label}
              </Typography>
            </Container>
          </Button>
        ) : (
          <DropdownMenuItem
            key={item.id}
            data-cy={`profile-menu-action-${item.id}`}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            className="group p-0"
          >
            <Container overrideDefaults className="flex items-center gap-2 overflow-hidden p-0">
              <Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              <Typography
                as="span"
                overrideDefaults
                className="truncate text-base font-medium text-muted-foreground transition-colors group-hover:text-foreground"
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

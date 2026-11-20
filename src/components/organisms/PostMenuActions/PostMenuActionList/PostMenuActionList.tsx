'use client';

import type { LucideIcon } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { DropdownMenuItem } from '@/atoms/DropdownMenu/DropdownMenu';
import { Typography } from '@/atoms/Typography/Typography';
import { MENU_VARIANT, type MenuVariant } from '@/config/ui';
import { cn } from '@/libs/utils/utils';

export interface PostMenuActionListItem {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void | Promise<void>;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
}

interface PostMenuActionListProps {
  items: PostMenuActionListItem[];
  variant: MenuVariant;
  /** Called once an item's action has run (closes the menu). */
  onActionComplete: () => void;
  /** Each item's `data-cy` is `<prefix>-<id>`. */
  dataCyPrefix?: string;
}

/**
 * The rows of a post's ⋯ menu: icon and label in the muted colour (destructive in red), turning to
 * the foreground colour on hover. Menu items in the dropdown, ghost buttons in the mobile sheet.
 * External resource cards use it for their ⋯ menu too.
 */
export function PostMenuActionList({
  items,
  variant,
  onActionComplete,
  dataCyPrefix = 'post-menu-action',
}: PostMenuActionListProps) {
  const handleItemClick = async (item: PostMenuActionListItem) => {
    await item.onClick();
    onActionComplete();
  };

  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const color = item.variant === 'destructive' ? 'text-destructive' : 'text-muted-foreground';

        return variant === MENU_VARIANT.SHEET ? (
          <Button
            key={item.id}
            data-cy={`${dataCyPrefix}-${item.id}`}
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
            onSelect={(event) => event.preventDefault()}
            key={item.id}
            data-cy={`${dataCyPrefix}-${item.id}`}
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

'use client';

import type { ComponentProps, ComponentType } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { postActionsButtonVariants, postActionsCountVariants } from './PostActionsBar.variants';

type PostActionButtonProps = Omit<ComponentProps<typeof Button>, 'variant' | 'size' | 'children' | 'aria-label'> & {
  icon: ComponentType<{ className?: string; strokeWidth?: number; fill?: string }>;
  /** Shown after the icon; nothing shows when `count` is undefined. */
  count?: number | string;
  ariaLabel: string;
  variant?: 'default' | 'visual';
  /** What the row sits on: `muted` is the embed surface (`bg-embed`) of a resource card or a quoted post. */
  surface?: 'default' | 'muted';
  iconProps?: { fill?: string; className?: string };
};

/**
 * One button of a post's action row (tag, reply, repost, more): the icon and its count in a filled
 * pill. External resource cards use it too, so their row reads like the post's. Extra props (a
 * trigger's `asChild` props, `data-cy`, `title`) reach the button, so a menu can open from it.
 */
export function PostActionButton({
  icon: Icon,
  count,
  ariaLabel,
  variant = 'default',
  surface = 'default',
  iconProps,
  className,
  ...props
}: PostActionButtonProps) {
  return (
    <Button
      variant="secondary"
      size="sm"
      className={cn(postActionsButtonVariants({ variant, surface }), className)}
      aria-label={ariaLabel}
      {...props}
    >
      <Icon {...iconProps} />
      {count !== undefined && (
        <Typography as="span" overrideDefaults className={postActionsCountVariants({ variant })}>
          {count}
        </Typography>
      )}
    </Button>
  );
}

'use client';

import * as React from 'react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';

import { UserRoundPlus, Tag, StickyNote } from 'lucide-react';
import { cn } from '@/libs/utils/utils';
export interface UserData {
  id: string;
  name: string;
  handle: string;
  avatar?: string;
  tagsCount?: number;
  postsCount?: number;
}
interface UserProps {
  user: UserData;
  onAction?: (userId: string) => void;
  actionIcon?: React.ReactNode;
  showAction?: boolean;
  actionVariant?: ButtonVariant;
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  'data-testid'?: string;
}
export function User({
  user,
  onAction,
  actionIcon = <UserRoundPlus className="h-4 w-4" />,
  showAction = true,
  actionVariant = ButtonVariant.SECONDARY,
  className,
  'data-testid': dataTestId,
}: UserProps) {
  return (
    <Container className={cn('flex flex-row items-center gap-2', className)} data-testid={dataTestId || 'user'}>
      <AvatarWithFallback
        avatarUrl={user.avatar}
        name={user.name}
        fallbackSeed={user.id}
        size="md"
        alt={user.name}
        data-testid="user-avatar"
      />

      <Container className="flex min-w-0 flex-1 flex-col">
        <Typography size="sm" className="truncate font-bold" data-testid="user-name">
          {user.name}
        </Typography>
        {user.tagsCount && user.postsCount ? (
          <Container className="flex flex-row gap-2">
            <Typography
              className="flex items-center justify-center gap-1 truncate text-xs font-medium text-muted-foreground"
              data-testid="user-tags-count"
            >
              <Tag className="h-2 w-2" />
              {user.tagsCount}
            </Typography>
            <Typography
              className="flex items-center justify-center gap-1 truncate text-xs font-medium text-muted-foreground"
              data-testid="user-posts-count"
            >
              <StickyNote className="h-2 w-2" />
              {user.postsCount}
            </Typography>
          </Container>
        ) : (
          <Typography className="truncate text-xs font-medium text-muted-foreground" data-testid="user-handle">
            {user.handle}
          </Typography>
        )}
      </Container>

      {showAction && (
        <Button
          onClick={() => onAction?.(user.id)}
          variant={actionVariant}
          size="sm"
          className="h-8 w-8"
          data-testid={`user-action-${user.id}`}
        >
          {actionIcon}
        </Button>
      )}
    </Container>
  );
}

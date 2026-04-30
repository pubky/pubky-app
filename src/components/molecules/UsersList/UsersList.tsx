'use client';

import * as React from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { User, UserData } from '../User/User';

import { Users } from 'lucide-react';
import { cn } from '@/libs/utils/utils';
interface UsersListProps {
  users: UserData[];
  onFollow?: (userId: string) => void;
  onSeeAll?: () => void;
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  title?: string;
  maxUsers?: number;
}
export function UsersList({ users, onFollow, onSeeAll, className, title, maxUsers = 3, ...props }: UsersListProps) {
  const displayUsers = users.slice(0, maxUsers);
  const handleFollow = (userId: string) => {
    onFollow?.(userId);
  };
  const handleSeeAll = () => {
    onSeeAll?.();
  };
  return (
    <Container className={cn('flex flex-col gap-2 bg-background', className)} {...props}>
      {title && (
        <Heading level={2} size="lg" className={cn('font-light text-muted-foreground', className)}>
          {title}
        </Heading>
      )}

      {/* Users List */}
      <Container className="flex flex-col items-center justify-center gap-2">
        {displayUsers.map((user) => (
          <User
            key={user.id}
            user={user}
            onAction={handleFollow}
            showAction={!!onFollow}
            data-testid={`user-${user.id}`}
          />
        ))}
      </Container>

      {/* See All Button */}
      {users.length > maxUsers && (
        <Button
          variant="outline"
          onClick={handleSeeAll}
          className="flex w-full items-center justify-center gap-2"
          data-testid="see-all-button"
        >
          <Users className="h-4 w-4" />
          <Typography size="sm" className="font-bold">
            See all
          </Typography>
        </Button>
      )}
    </Container>
  );
}

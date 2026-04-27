'use client';

import * as React from 'react';
import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import { Users } from 'lucide-react';
interface UsersListProps {
  users: Molecules.UserData[];
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
    <Atoms.Container className={Libs.cn('flex flex-col gap-2 bg-background', className)} {...props}>
      {title && (
        <Atoms.Heading level={2} size="lg" className={Libs.cn('font-light text-muted-foreground', className)}>
          {title}
        </Atoms.Heading>
      )}

      {/* Users List */}
      <Atoms.Container className="flex flex-col items-center justify-center gap-2">
        {displayUsers.map((user) => (
          <Molecules.User
            key={user.id}
            user={user}
            onAction={handleFollow}
            showAction={!!onFollow}
            data-testid={`user-${user.id}`}
          />
        ))}
      </Atoms.Container>

      {/* See All Button */}
      {users.length > maxUsers && (
        <Atoms.Button
          variant="outline"
          onClick={handleSeeAll}
          className="flex w-full items-center justify-center gap-2"
          data-testid="see-all-button"
        >
          <Users className="h-4 w-4" />
          <Atoms.Typography size="sm" className="font-bold">
            See all
          </Atoms.Typography>
        </Atoms.Button>
      )}
    </Atoms.Container>
  );
}

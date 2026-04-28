'use client';

import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import * as React from 'react';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Core from '@/core';

export const HeaderSignIn = ({ ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const { userDetails, currentUserPubky } = useCurrentUserProfile();
  const unreadNotifications = Core.useNotificationStore((state) => state.selectUnread());

  return (
    <Atoms.Container className="min-w-0 flex-1 flex-row items-center justify-end gap-3" {...props}>
      <Organisms.SearchInput />
      <Molecules.HeaderNavigationButtons
        avatarImage={
          currentUserPubky && userDetails?.image
            ? Core.FileController.getAvatarUrl(currentUserPubky, userDetails.indexed_at)
            : undefined
        }
        avatarName={userDetails?.name}
        avatarSeed={currentUserPubky || userDetails?.name || 'user'}
        counter={unreadNotifications}
      />
    </Atoms.Container>
  );
};

'use client';

import * as React from 'react';
import { Megaphone } from 'lucide-react';
import { getUserProfileUrl } from '@/app/routes';
import { Avatar, AvatarFallback, AvatarImage } from '@/atoms/Avatar/Avatar';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { useBulkUserAvatars } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { useMuteUser } from '@/hooks/useMuteUser/useMuteUser';
import { isAppError } from '@/libs/error/error.utils';
import { extractInitials, truncateMiddle } from '@/libs/utils/utils';
import { FacehashAvatar } from '@/molecules/FacehashAvatar/FacehashAvatar';
import { toast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { MutedUsersListSkeleton } from './MutedUsersList.skeleton';
import { mapUserIdsToMutedUsers } from './MutedUsersList.utils';

export function MutedUsersList() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { mutedUserIds, isLoading: isMutedLoading } = useMutedUsers();
  const { usersMap, isLoading: isUsersLoading } = useBulkUserAvatars(mutedUserIds);
  const { toggleMute, isLoading: isMuteLoading, isUserLoading: isMuteUserLoading } = useMuteUser();
  const [isLoadingUnmuteAll, setIsLoadingUnmuteAll] = React.useState(false);
  const mutedUsers = mapUserIdsToMutedUsers(mutedUserIds, usersMap);
  const isLoading = isMutedLoading || isUsersLoading;
  const handleUnmute = async (userId: string, userName?: string) => {
    try {
      await toggleMute(userId, true);
      toast({
        title: `${userName || userId} unmuted`,
      });
    } catch (error) {
      toast({
        variant: 'error',
        description: isAppError(error) ? error.message : 'Could not update mute status',
      });
    }
  };
  const handleUnmuteAll = async () => {
    if (mutedUserIds.length === 0) return;

    // Capture the current list to avoid issues with reactive updates during iteration
    const idsToUnmute = [...mutedUserIds];
    setIsLoadingUnmuteAll(true);
    try {
      // Use Promise.allSettled for parallel execution with graceful error handling
      const results = await Promise.allSettled(idsToUnmute.map((userId) => toggleMute(userId, true)));
      const failedCount = results.filter((r) => r.status === 'rejected').length;
      if (failedCount > 0) {
        toast({
          variant: 'warning',
          title: 'Partial success',
          description: `${idsToUnmute.length - failedCount} users unmuted, ${failedCount} failed.`,
        });
      } else {
        toast({
          title: 'All users unmuted',
        });
      }
    } catch (error) {
      toast({
        variant: 'error',
        description: isAppError(error) ? error.message : 'Could not update mute status',
      });
    } finally {
      setIsLoadingUnmuteAll(false);
    }
  };
  return (
    <Container data-cy="muted-users-root" overrideDefaults className="inline-flex w-full flex-col gap-6">
      {isLoading ? (
        <MutedUsersListSkeleton />
      ) : mutedUsers && mutedUsers.length > 0 ? (
        <>
          {mutedUsers.map((mutedUser) => (
            <Container overrideDefaults key={mutedUser?.id} className="flex w-full items-center justify-between gap-3">
              <Link
                href={getUserProfileUrl(mutedUser.id, currentUserPubky)}
                overrideDefaults
                className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80"
              >
                <Avatar className="h-10 w-10">
                  {mutedUser?.avatar && <AvatarImage src={mutedUser.avatar} alt={mutedUser?.name ?? 'User'} />}
                  <AvatarFallback className="overflow-hidden border-none">
                    <FacehashAvatar
                      seed={mutedUser?.id || mutedUser?.name || 'user'}
                      initial={
                        extractInitials({
                          name: mutedUser?.name || '',
                          maxLength: 1,
                        }) ||
                        mutedUser?.id?.charAt(0).toUpperCase() ||
                        'U'
                      }
                    />
                  </AvatarFallback>
                </Avatar>
                <Container overrideDefaults className="flex min-w-0 flex-1 flex-col items-start">
                  <Typography as="span" overrideDefaults className="block max-w-full truncate text-base font-bold">
                    {mutedUser?.name || 'Unknown User'}
                  </Typography>
                  <Typography
                    as="span"
                    overrideDefaults
                    className="text-xs tracking-widest text-muted-foreground uppercase"
                  >
                    {truncateMiddle(mutedUser?.id || '', 12)}
                  </Typography>
                </Container>
              </Link>
              <Button
                id="unmute-btn"
                variant="secondary"
                size="sm"
                className="rounded-full"
                onClick={() => handleUnmute(mutedUser.id, mutedUser?.name)}
                disabled={isMuteLoading || isMuteUserLoading(mutedUser.id)}
              >
                <Megaphone size={16} />
                {'Unmute'}
              </Button>
            </Container>
          ))}
          {mutedUsers.length > 1 && (
            <Button
              variant="secondary"
              size="lg"
              className="rounded-full"
              onClick={handleUnmuteAll}
              disabled={isLoadingUnmuteAll}
            >
              <Megaphone size={16} />
              {'Unmute all users'}
            </Button>
          )}
        </>
      ) : (
        <Typography as="p" overrideDefaults className="w-full py-4 text-center text-lg text-muted-foreground">
          {'No muted users yet'}
        </Typography>
      )}
    </Container>
  );
}

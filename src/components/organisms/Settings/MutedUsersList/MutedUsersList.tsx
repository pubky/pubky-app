'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as Hooks from '@/hooks';
import * as Molecules from '@/molecules';
import { MutedUsersListSkeleton } from './MutedUsersList.skeleton';
import { mapUserIdsToMutedUsers } from './MutedUsersList.utils';
import { Megaphone } from 'lucide-react';
export function MutedUsersList() {
  const t = useTranslations('mutedUsers');
  const tCommon = useTranslations('common');
  const tToast = useTranslations('toast.mute');
  const { mutedUserIds, isLoading: isMutedLoading } = Hooks.useMutedUsers();
  const { usersMap, isLoading: isUsersLoading } = Hooks.useBulkUserAvatars(mutedUserIds);
  const { toggleMute, isLoading: isMuteLoading, isUserLoading: isMuteUserLoading } = Hooks.useMuteUser();
  const [isLoadingUnmuteAll, setIsLoadingUnmuteAll] = React.useState(false);
  const mutedUsers = mapUserIdsToMutedUsers(mutedUserIds, usersMap);
  const isLoading = isMutedLoading || isUsersLoading;
  const handleUnmute = async (userId: string, userName?: string) => {
    try {
      await toggleMute(userId, true);
      Molecules.toast({
        title: t('userUnmuted'),
        description: t('userUnmutedDesc', {
          username: userName || userId,
        }),
      });
    } catch (error) {
      Molecules.toast({
        title: tCommon('error'),
        description: Libs.isAppError(error) ? error.message : tToast('failed'),
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
        Molecules.toast({
          title: t('partialSuccess'),
          description: t('partialSuccessDesc', {
            success: idsToUnmute.length - failedCount,
            failed: failedCount,
          }),
        });
      } else {
        Molecules.toast({
          title: t('allUsersUnmuted'),
          description: t('allUsersUnmutedDesc'),
        });
      }
    } catch (error) {
      Molecules.toast({
        title: tCommon('error'),
        description: Libs.isAppError(error) ? error.message : tToast('failed'),
      });
    } finally {
      setIsLoadingUnmuteAll(false);
    }
  };
  return (
    <Atoms.Container data-cy="muted-users-root" overrideDefaults className="inline-flex w-full flex-col gap-6">
      {isLoading ? (
        <MutedUsersListSkeleton />
      ) : mutedUsers && mutedUsers.length > 0 ? (
        <>
          {mutedUsers.map((mutedUser) => (
            <Atoms.Container
              overrideDefaults
              key={mutedUser?.id}
              className="flex w-full items-center justify-between gap-3"
            >
              <Atoms.Link
                href={`/profile/${mutedUser.id}`}
                overrideDefaults
                className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80"
              >
                <Atoms.Avatar className="h-10 w-10">
                  {mutedUser?.avatar && (
                    <Atoms.AvatarImage src={mutedUser.avatar} alt={mutedUser?.name ?? tCommon('user')} />
                  )}
                  <Atoms.AvatarFallback className="overflow-hidden border-none">
                    <Molecules.FacehashAvatar
                      seed={mutedUser?.id || mutedUser?.name || 'user'}
                      initial={
                        Libs.extractInitials({
                          name: mutedUser?.name || '',
                          maxLength: 1,
                        }) ||
                        mutedUser?.id?.charAt(0).toUpperCase() ||
                        'U'
                      }
                    />
                  </Atoms.AvatarFallback>
                </Atoms.Avatar>
                <Atoms.Container overrideDefaults className="flex min-w-0 flex-1 flex-col items-start">
                  <Atoms.Typography
                    as="span"
                    overrideDefaults
                    className="block max-w-full truncate text-base font-bold"
                  >
                    {mutedUser?.name || tCommon('unknownUser')}
                  </Atoms.Typography>
                  <Atoms.Typography
                    as="span"
                    overrideDefaults
                    className="text-xs tracking-widest text-muted-foreground uppercase"
                  >
                    {Libs.truncateMiddle(mutedUser?.id || '', 12)}
                  </Atoms.Typography>
                </Atoms.Container>
              </Atoms.Link>
              <Atoms.Button
                id="unmute-btn"
                variant="secondary"
                size="sm"
                className="rounded-full"
                onClick={() => handleUnmute(mutedUser.id, mutedUser?.name)}
                disabled={isMuteLoading || isMuteUserLoading(mutedUser.id)}
              >
                <Megaphone size={16} />
                {t('unmute')}
              </Atoms.Button>
            </Atoms.Container>
          ))}
          {mutedUsers.length > 1 && (
            <Atoms.Button
              variant="secondary"
              size="lg"
              className="rounded-full"
              onClick={handleUnmuteAll}
              disabled={isLoadingUnmuteAll}
            >
              <Megaphone size={16} />
              {t('unmuteAll')}
            </Atoms.Button>
          )}
        </>
      ) : (
        <Atoms.Typography as="p" overrideDefaults className="w-full py-4 text-center text-lg text-muted-foreground">
          {t('noMutedUsers')}
        </Atoms.Typography>
      )}
    </Atoms.Container>
  );
}

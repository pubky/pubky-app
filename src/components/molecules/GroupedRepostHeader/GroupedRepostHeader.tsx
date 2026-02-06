'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';
import { MAX_VISIBLE_AVATARS } from './GroupedRepostHeader.constants';
import { getFirstReposterName } from './GroupedRepostHeader.utils';
import { RepostersOverlay } from './RepostersOverlay';
import type { GroupedRepostHeaderProps } from './GroupedRepostHeader.types';

/**
 * GroupedRepostHeader
 *
 * Header bar displayed on top of grouped reposts showing multiple reposters.
 * Desktop: "[Name] and N others reposted this" with clickable avatar group → opens Dialog
 * Mobile: "[Name], others reposted" (clickable text) → opens Sheet
 */
export function GroupedRepostHeader({
  reposterIds,
  includesCurrentUser,
  earliestTimestamp,
  isExpanded = false,
  onExpandToggle,
}: GroupedRepostHeaderProps) {
  const t = useTranslations('repost');
  const { formatRelativeTime } = Hooks.useRelativeTime();
  const isMobile = Hooks.useIsMobile();

  // Get first reposter's profile (skip if current user is first - we'll show "You")
  const firstReposterIdToFetch = includesCurrentUser ? '' : reposterIds[0] || '';
  const { profile: firstReposter, isLoading: isFirstReposterLoading } = Hooks.useUserProfile(firstReposterIdToFetch);

  // Get user details for avatars and expanded list
  const { users: reposterUsers, isLoading: isUsersLoading } = Hooks.useUserDetailsFromIds({
    userIds: reposterIds,
  });

  const timeAgo = formatRelativeTime(new Date(earliestTimestamp));
  const othersCount = reposterIds.length - 1;

  const firstName = getFirstReposterName({
    includesCurrentUser,
    isFirstReposterLoading,
    firstReposterProfile: firstReposter,
    firstReposterId: reposterIds[0] || '',
    youLabel: t('you'),
  });

  const handleOpenChange = (open: boolean) => {
    if (open !== isExpanded) {
      onExpandToggle?.();
    }
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onExpandToggle?.();
  };

  const isLoading = isFirstReposterLoading || isUsersLoading;

  if (isLoading && !includesCurrentUser) {
    return (
      <Atoms.Container
        className="flex h-12 items-center justify-between overflow-hidden rounded-t-md bg-muted px-6 py-3 md:h-14"
        overrideDefaults
        data-testid="grouped-repost-header"
      >
        <Atoms.Container className="flex items-center gap-3" overrideDefaults>
          <Libs.Repeat className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Atoms.Container overrideDefaults className="h-6 w-32 animate-pulse rounded bg-muted-foreground/20" />
        </Atoms.Container>
      </Atoms.Container>
    );
  }

  return (
    <>
      <Atoms.Container
        overrideDefaults
        className="flex h-12 items-center justify-between overflow-hidden rounded-t-md bg-muted px-6 py-3 md:h-14"
        data-testid="grouped-repost-header"
      >
        {/* Left section: icon + text + avatars */}
        <Atoms.Container className="flex min-w-0 flex-1 items-center gap-3" overrideDefaults>
          <Libs.Repeat className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />

          {/* Desktop: Static text */}
          <Atoms.Typography
            as="span"
            className="hidden text-base leading-6 font-bold text-foreground md:inline"
            overrideDefaults
            data-testid="grouped-repost-text"
          >
            {othersCount > 0
              ? t('youAndOthersReposted', { name: firstName, count: othersCount })
              : t('singleReposted', { name: firstName })}
          </Atoms.Typography>

          {/* Desktop: Clickable avatar group */}
          {!isMobile && reposterUsers.length > 0 && (
            <Atoms.Button
              overrideDefaults
              onClick={handleTriggerClick}
              className="hidden cursor-pointer items-center pr-2 transition-opacity hover:opacity-80 md:flex"
              aria-label={t('reposters')}
              data-testid="grouped-repost-avatars"
            >
              <Molecules.AvatarGroup
                items={reposterUsers}
                totalCount={reposterIds.length}
                maxAvatars={MAX_VISIBLE_AVATARS}
              />
            </Atoms.Button>
          )}

          {/* Mobile: Clickable text */}
          {isMobile && (
            <Atoms.Button
              overrideDefaults
              onClick={handleTriggerClick}
              className="flex-1 cursor-pointer text-left text-base leading-6 font-bold text-foreground md:hidden"
              aria-label={t('reposters')}
              data-testid="grouped-repost-text-mobile"
            >
              {othersCount > 0 ? t('mobileReposted', { name: firstName }) : t('singleReposted', { name: firstName })}
            </Atoms.Button>
          )}
        </Atoms.Container>

        {/* Right section: timestamp */}
        <Atoms.Container className="flex shrink-0 items-center gap-1" overrideDefaults>
          <Libs.Clock className="size-4 text-muted-foreground" aria-hidden="true" />
          <Atoms.Typography
            as="span"
            className="text-xs leading-4 font-medium tracking-[1.2px] whitespace-nowrap text-muted-foreground"
            overrideDefaults
          >
            {timeAgo}
          </Atoms.Typography>
        </Atoms.Container>
      </Atoms.Container>

      <RepostersOverlay
        variant={isMobile ? 'sheet' : 'dialog'}
        open={isExpanded}
        onOpenChange={handleOpenChange}
        reposters={reposterUsers}
      />
    </>
  );
}

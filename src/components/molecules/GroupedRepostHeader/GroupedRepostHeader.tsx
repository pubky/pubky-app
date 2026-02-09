'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';
import { NAME_TOKEN } from '@/atoms';
import { MAX_VISIBLE_AVATARS } from './GroupedRepostHeader.constants';
import { getFirstReposterName } from './GroupedRepostHeader.utils';
import { RepostersOverlay } from './RepostersOverlay';
import { PostHeaderTimestamp } from '../PostHeaderTimestamp';
import type { GroupedRepostHeaderProps } from './GroupedRepostHeader.types';

const HEADER_CLASS = 'flex h-12 items-center justify-between overflow-hidden rounded-t-md bg-muted px-6 py-3 md:h-14';
const TEXT_BASE_CLASS = 'flex min-w-0 flex-1 items-center text-base leading-6 font-bold text-foreground';
const BUTTON_BASE_CLASS = `${TEXT_BASE_CLASS} cursor-pointer overflow-hidden bg-transparent p-0`;

/**
 * GroupedRepostHeader
 *
 * Header bar displayed on top of grouped reposts showing multiple reposters.
 * Desktop: "[Name] and N others reposted this" with clickable avatar group → opens Dialog
 * Mobile: "[Name], others reposted" (clickable text) → opens Sheet
 *
 * For single reposter: displays a simple static header without interactive elements.
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

  const isSingleReposter = reposterIds.length === 1;
  const firstReposterId = reposterIds[0] ?? '';
  const timeAgo = formatRelativeTime(new Date(earliestTimestamp));

  const { profile: firstReposter, isLoading: isFirstReposterLoading } = Hooks.useUserProfile(
    includesCurrentUser ? '' : firstReposterId,
  );
  const { users: reposterUsers, isLoading: isUsersLoading } = Hooks.useUserDetailsFromIds({
    userIds: isSingleReposter ? [] : reposterIds,
  });

  const isLoading = isFirstReposterLoading || (!isSingleReposter && isUsersLoading);

  const firstName = getFirstReposterName({
    includesCurrentUser,
    isFirstReposterLoading,
    firstReposterProfile: firstReposter,
    firstReposterId,
    youLabel: t('you'),
  });

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onExpandToggle?.();
  };

  if (isLoading && !includesCurrentUser) {
    return (
      <Atoms.Container className={HEADER_CLASS} overrideDefaults data-testid="grouped-repost-header">
        <Atoms.Container className="flex items-center gap-3" overrideDefaults>
          <Libs.Repeat className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Atoms.Container overrideDefaults className="h-6 w-32 animate-pulse rounded bg-muted-foreground/20" />
        </Atoms.Container>
      </Atoms.Container>
    );
  }

  return (
    <>
      <Atoms.Container className={HEADER_CLASS} overrideDefaults data-testid="grouped-repost-header">
        <Atoms.Container className="flex min-w-0 flex-1 items-center gap-3 pr-3" overrideDefaults>
          <Libs.Repeat className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />

          {isSingleReposter ? (
            <Atoms.Typography as="span" className={TEXT_BASE_CLASS} overrideDefaults data-testid="grouped-repost-text">
              <Atoms.RepostText template={t('singleReposted', { name: NAME_TOKEN })} name={firstName} />
            </Atoms.Typography>
          ) : (
            <>
              {/* Desktop */}
              <Atoms.Button
                overrideDefaults
                onClick={handleTriggerClick}
                className={`${BUTTON_BASE_CLASS} hidden gap-2 md:inline-flex`}
                aria-label={t('reposters')}
                data-testid="grouped-repost-text"
              >
                <Atoms.Typography as="span" className="flex min-w-0 items-center hover:underline" overrideDefaults>
                  <Atoms.RepostText
                    template={t('youAndOthersReposted', { name: NAME_TOKEN, count: reposterIds.length - 1 })}
                    name={firstName}
                    preserveSpace
                  />
                </Atoms.Typography>
                {reposterUsers.length > 0 && (
                  <Atoms.Container
                    className="shrink-0 transition-opacity hover:opacity-80"
                    overrideDefaults
                    data-testid="grouped-repost-avatars"
                  >
                    <Molecules.AvatarGroup
                      items={reposterUsers}
                      totalCount={reposterIds.length}
                      maxAvatars={MAX_VISIBLE_AVATARS}
                    />
                  </Atoms.Container>
                )}
              </Atoms.Button>

              {/* Mobile */}
              <Atoms.Button
                overrideDefaults
                onClick={handleTriggerClick}
                className={`${BUTTON_BASE_CLASS} inline-flex text-left md:hidden`}
                aria-label={t('reposters')}
                data-testid="grouped-repost-text-mobile"
              >
                <Atoms.RepostText template={t('mobileReposted', { name: NAME_TOKEN })} name={firstName} />
              </Atoms.Button>
            </>
          )}
        </Atoms.Container>

        <PostHeaderTimestamp timeAgo={timeAgo} />
      </Atoms.Container>

      {isExpanded && !isSingleReposter && (
        <RepostersOverlay
          variant={isMobile ? 'sheet' : 'dialog'}
          open={isExpanded}
          onOpenChange={(open) => !open && onExpandToggle?.()}
          reposters={reposterUsers}
        />
      )}
    </>
  );
}

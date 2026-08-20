'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, PlusCircle } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { DynamicLucideIcon } from '@/atoms/DynamicLucideIcon/DynamicLucideIcon';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { FeedController } from '@/controllers/feed/feed';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { Logger } from '@/libs/logger/logger';
import { handleFeedNavClick } from '@/libs/utils/feedScrollTop';
import { preloadLucideIcons } from '@/libs/utils/lucideIcons';
import { cn } from '@/libs/utils/utils';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import {
  REACH_FILTER_META,
  type ReachFilterValue,
  TAGGED_AS_FILTER_KEY,
} from '@/molecules/Filters/FilterReach/FilterReach';
import { useHomeStore } from '@/stores/home/home.store';
import { REACH } from '@/stores/home/home.types';
import { CustomFeedDialog } from '../CustomFeedDialog/CustomFeedDialog';

// Below lg the strip is a sticky tab bar under the compact mobile header:
// the selected tab shows icon + label, the rest collapse to icon-only cells.
// At lg+ every tab is icon + label and shares the row evenly.
const FEED_TAB_CLASS = 'relative flex min-h-12 items-center justify-center gap-2 border-b py-1.5 lg:min-w-40';
const FEED_TAB_ACTIVE_WIDTH_CLASS = 'flex-none px-4 lg:flex-1';
const FEED_TAB_INACTIVE_WIDTH_CLASS = 'min-w-12 flex-1 px-2 lg:flex-1';
const FEED_TAB_LABEL_CLASS = 'truncate text-sm font-medium leading-5';
const FEED_TAB_PENCIL_CLASS =
  'absolute top-1/2 right-1 z-10 -translate-y-1/2 cursor-pointer p-2 text-muted-foreground transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100';

let cachedFeeds: FeedModelSchema[] = [];
interface FeedNavigationProps {
  className?: string;
}

export const FeedNavigation = ({ className }: FeedNavigationProps) => {
  const pathname = usePathname();
  const { isAuthenticated, requireAuth } = useRequireAuth();
  const { reach, taggedAsActive, profileTags } = useHomeStore();
  const customFeeds = useLiveQuery(
    async () => {
      try {
        if (!isAuthenticated) {
          cachedFeeds = [];
          return [] as FeedModelSchema[];
        }
        const result = await FeedController.getList();
        cachedFeeds = result;
        return result;
      } catch (error) {
        Logger.error('[FeedNavigation] Failed to query custom feeds', {
          error,
        });
        return [] as FeedModelSchema[];
      }
    },
    [isAuthenticated],
    isAuthenticated ? cachedFeeds : [],
  );

  // Warm the icon chunk cache as soon as feed data lands so tab icons paint
  // without a visible swap.
  useEffect(() => {
    preloadLucideIcons(customFeeds.map((feed) => feed.icon));
  }, [customFeeds]);

  // The first tab mirrors the reach selection the sidebar filter shows
  // (Tagged as counts as a selection), same derivation as HomeFeedFilters.
  const effectiveReach = isAuthenticated ? reach : REACH.ALL;
  const selectedReach: ReachFilterValue =
    isAuthenticated && taggedAsActive && profileTags.length > 0 ? TAGGED_AS_FILTER_KEY : effectiveReach;
  const { label: reachLabel, icon: ReachIcon } = REACH_FILTER_META[selectedReach];
  const isHomeActive = pathname === APP_ROUTES.HOME;

  return (
    <Container
      className={cn(
        'w-full flex-row overflow-x-auto',
        'mobile-menu-gradient-fade sticky top-(--header-height-settings) z-(--z-mobile-menu) bg-background',
        'lg:static lg:top-auto lg:z-auto lg:bg-transparent lg:after:hidden',
        className,
      )}
    >
      <Link
        overrideDefaults
        href={APP_ROUTES.HOME}
        aria-label={reachLabel}
        aria-current={isHomeActive ? 'page' : undefined}
        onClick={(event) =>
          handleFeedNavClick(event, {
            isActive: isHomeActive,
            smoothScrollWhenActive: true,
          })
        }
        className={cn(
          FEED_TAB_CLASS,
          isHomeActive ? FEED_TAB_ACTIVE_WIDTH_CLASS : FEED_TAB_INACTIVE_WIDTH_CLASS,
          isHomeActive ? 'border-white text-white' : 'border-border text-muted-foreground hover:text-white',
        )}
      >
        <ReachIcon className="size-5 shrink-0" />
        <Typography overrideDefaults className={cn(FEED_TAB_LABEL_CLASS, !isHomeActive && 'hidden lg:inline')}>
          {reachLabel}
        </Typography>
      </Link>

      {customFeeds.map((feed) => {
        const href = `${APP_ROUTES.FEED}/${feed.id}`;
        const isActive = pathname === href;

        return (
          <div
            key={href}
            className={cn(
              'group',
              FEED_TAB_CLASS,
              // The link is the sole in-flow child, so it carries the
              // horizontal padding and gives the collapsed (flex-none) tab
              // its content width; the pencil overlays the right padding.
              isActive ? 'flex-none lg:flex-1' : 'min-w-12 flex-1 lg:flex-1',
              isActive ? 'border-white' : 'border-border',
            )}
          >
            <Link
              overrideDefaults
              href={href}
              aria-label={feed.name}
              aria-current={isActive ? 'page' : undefined}
              onClick={(event) =>
                handleFeedNavClick(event, {
                  isActive,
                  smoothScrollWhenActive: false,
                })
              }
              className={cn(
                'flex h-full w-full min-w-0 items-center justify-center gap-2',
                isActive ? 'px-8' : 'px-2 lg:px-8',
                isActive ? 'text-white' : 'text-muted-foreground group-hover:text-white',
              )}
            >
              <DynamicLucideIcon name={feed.icon} className="size-5 shrink-0" />
              <Typography overrideDefaults className={cn(FEED_TAB_LABEL_CLASS, !isActive && 'hidden lg:inline')}>
                {feed.name}
              </Typography>
            </Link>
            <CustomFeedDialog mode="edit" feed={feed}>
              <Button
                overrideDefaults
                type="button"
                aria-label={`Edit ${feed.name}`}
                className={cn(FEED_TAB_PENCIL_CLASS, !isActive && 'hidden lg:block')}
              >
                <Pencil className="size-4" />
              </Button>
            </CustomFeedDialog>
          </div>
        );
      })}

      {isAuthenticated ? (
        <CustomFeedDialog mode="create">
          <Button
            overrideDefaults
            aria-label="Create feed"
            className={cn(
              FEED_TAB_CLASS,
              FEED_TAB_INACTIVE_WIDTH_CLASS,
              'cursor-pointer border-border text-muted-foreground hover:text-white',
            )}
          >
            <PlusCircle className="size-5 shrink-0" />
            <Typography overrideDefaults className={cn(FEED_TAB_LABEL_CLASS, 'hidden lg:inline')}>
              {'Feed'}
            </Typography>
          </Button>
        </CustomFeedDialog>
      ) : (
        <Button
          overrideDefaults
          aria-label="Create feed"
          className={cn(
            FEED_TAB_CLASS,
            FEED_TAB_INACTIVE_WIDTH_CLASS,
            'cursor-pointer border-border text-muted-foreground hover:text-white',
          )}
          onClick={() => requireAuth(() => undefined)}
        >
          <PlusCircle className="size-5 shrink-0" />
          <Typography overrideDefaults className={cn(FEED_TAB_LABEL_CLASS, 'hidden lg:inline')}>
            {'Feed'}
          </Typography>
        </Button>
      )}
    </Container>
  );
};

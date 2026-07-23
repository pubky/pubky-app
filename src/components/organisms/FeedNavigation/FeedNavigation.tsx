'use client';

import { usePathname } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { HeartHandshake, type LucideProps, Pencil, PlusCircle, Radio, UserRound, Waypoints } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { APP_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { FeedController } from '@/controllers/feed/feed';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { UsersRound2 } from '@/icons';
import { Logger } from '@/libs/logger/logger';
import { handleFeedNavClick } from '@/libs/utils/feedScrollTop';
import { cn } from '@/libs/utils/utils';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { useHomeStore } from '@/stores/home/home.store';
import { REACH, type ReachType } from '@/stores/home/home.types';
import { CustomFeedDialog } from '../CustomFeedDialog/CustomFeedDialog';

// Module-level cache: survives remounts within the session so that
// navigating between /home and /feed/[id] doesn't flash empty tabs.
let cachedFeeds: FeedModelSchema[] = [];
const HOME_FEED_REACH: Record<
  ReachType,
  {
    icon: ComponentType<LucideProps>;
    labelKey: 'all' | 'myNetwork' | 'following' | 'friends' | 'me';
  }
> = {
  [REACH.ALL]: { icon: Radio, labelKey: 'all' },
  [REACH.NETWORK]: { icon: Waypoints, labelKey: 'myNetwork' },
  [REACH.FOLLOWING]: { icon: UsersRound2, labelKey: 'following' },
  [REACH.FRIENDS]: { icon: HeartHandshake, labelKey: 'friends' },
  [REACH.ME]: { icon: UserRound, labelKey: 'me' },
};

interface FeedNavigationProps {
  className?: string;
}
export const FeedNavigation = ({ className }: FeedNavigationProps) => {
  const pathname = usePathname();
  const tHeader = useTranslations('header');
  const tReach = useTranslations('filters.reach');
  const tDialog = useTranslations('dialogs.customFeed');
  const { isAuthenticated, requireAuth } = useRequireAuth();
  const reach = useHomeStore((state) => state.reach);
  const effectiveReach = isAuthenticated || reach === REACH.NETWORK ? reach : REACH.ALL;
  const homeFeedReach = HOME_FEED_REACH[effectiveReach];
  const HomeFeedReachIcon = homeFeedReach.icon;
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
  const customFeedsMapped = customFeeds.map((f) => ({
    name: f.name,
    icon: <Pencil className="size-5 shrink-0" />,
    href: APP_ROUTES.FEED + '/' + f.id,
  }));
  const feeds = [
    {
      name: tReach(homeFeedReach.labelKey),
      icon: <HomeFeedReachIcon className="size-5 shrink-0" data-reach-icon={effectiveReach} />,
      href: APP_ROUTES.HOME,
    },
    ...customFeedsMapped,
  ];
  return (
    <Container className={cn('overflow-x-auto lg:flex-row', className)}>
      <Heading level={2} size="lg" className="mb-2 font-light text-muted-foreground lg:hidden">
        {tHeader('feed')}
      </Heading>

      {feeds.map((f) => (
        <Link
          overrideDefaults
          key={f.href}
          href={f.href}
          onClick={(event) =>
            handleFeedNavClick(event, {
              isActive: pathname === f.href,
              smoothScrollWhenActive: f.href === APP_ROUTES.HOME,
            })
          }
          className={cn(
            'flex min-h-12 w-full min-w-40 items-center gap-x-2 border-b transition-colors hover:text-white lg:justify-center',
            pathname === f.href ? 'border-white text-white' : 'border-border text-muted-foreground',
          )}
        >
          {f.href !== APP_ROUTES.HOME && f.href === pathname ? (
            <CustomFeedDialog mode="edit">
              <Button overrideDefaults className="cursor-pointer">
                {f.icon}
              </Button>
            </CustomFeedDialog>
          ) : (
            f.icon
          )}

          <Typography overrideDefaults className="font-medium lg:text-sm">
            {f.name}
          </Typography>
        </Link>
      ))}

      {isAuthenticated ? (
        <CustomFeedDialog mode="create">
          <Button
            overrideDefaults
            className="flex min-h-12 w-full min-w-40 cursor-pointer items-center gap-x-2 border-b border-border text-muted-foreground transition-colors hover:text-white lg:justify-center"
          >
            <PlusCircle className="size-5 shrink-0" />

            <Typography overrideDefaults className="font-medium lg:text-sm">
              {tDialog('createTitle')}
            </Typography>
          </Button>
        </CustomFeedDialog>
      ) : (
        <Button
          overrideDefaults
          className="flex min-h-12 w-full min-w-40 cursor-pointer items-center gap-x-2 border-b border-border text-muted-foreground transition-colors hover:text-white lg:justify-center"
          onClick={() => requireAuth(() => undefined)}
        >
          <PlusCircle className="size-5 shrink-0" />

          <Typography overrideDefaults className="font-medium lg:text-sm">
            {tDialog('createTitle')}
          </Typography>
        </Button>
      )}
    </Container>
  );
};

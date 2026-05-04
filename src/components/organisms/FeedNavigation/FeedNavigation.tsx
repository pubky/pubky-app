'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { CustomFeedDialog } from '../CustomFeedDialog/CustomFeedDialog';

import { APP_ROUTES } from '@/app/routes';
import { usePathname } from 'next/navigation';

// Module-level cache: survives remounts within the session so that
// navigating between /home and /feed/[id] doesn't flash empty tabs.
import { Pencil, Home, PlusCircle } from 'lucide-react';
import { Logger } from '@/libs/logger/logger';
import { cn } from '@/libs/utils/utils';
import { FeedController } from '@/controllers/feed/feed';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
let cachedFeeds: FeedModelSchema[] = [];
interface FeedNavigationProps {
  className?: string;
}
export const FeedNavigation = ({ className }: FeedNavigationProps) => {
  const pathname = usePathname();
  const tHeader = useTranslations('header');
  const tDialog = useTranslations('dialogs.customFeed');
  const customFeeds = useLiveQuery(
    async () => {
      try {
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
    [],
    cachedFeeds,
  );
  const customFeedsMapped = customFeeds.map((f) => ({
    name: f.name,
    icon: <Pencil className="size-5 shrink-0" />,
    href: APP_ROUTES.FEED + '/' + f.id,
  }));
  const feeds = [
    {
      name: tHeader('home'),
      icon: <Home className="size-5 shrink-0" />,
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
          className={cn(
            'flex min-h-12 w-full min-w-40 items-center gap-x-2 border-b transition-colors hover:text-white lg:justify-center',
            pathname === f.href ? 'border-white text-white' : 'border-muted-foreground text-muted-foreground',
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

      <CustomFeedDialog mode="create">
        <Button
          overrideDefaults
          className="flex min-h-12 w-full min-w-40 cursor-pointer items-center gap-x-2 border-b border-muted-foreground text-muted-foreground transition-colors hover:text-white lg:justify-center"
        >
          <PlusCircle className="size-5 shrink-0" />

          <Typography overrideDefaults className="font-medium lg:text-sm">
            {tDialog('createTitle')}
          </Typography>
        </Button>
      </CustomFeedDialog>
    </Container>
  );
};

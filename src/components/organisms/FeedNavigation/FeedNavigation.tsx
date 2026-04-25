'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import { APP_ROUTES } from '@/app/routes';
import { usePathname } from 'next/navigation';

// Module-level cache: survives remounts within the session so that
// navigating between /home and /feed/[id] doesn't flash empty tabs.
import { Pencil, Home, PlusCircle } from 'lucide-react';
let cachedFeeds: Core.FeedModelSchema[] = [];
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
        const result = await Core.FeedController.getList();
        cachedFeeds = result;
        return result;
      } catch (error) {
        Libs.Logger.error('[FeedNavigation] Failed to query custom feeds', {
          error,
        });
        return [] as Core.FeedModelSchema[];
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
    <Atoms.Container className={Libs.cn('overflow-x-auto lg:flex-row', className)}>
      <Atoms.Heading level={2} size="lg" className="mb-2 font-light text-muted-foreground lg:hidden">
        {tHeader('feed')}
      </Atoms.Heading>

      {feeds.map((f) => (
        <Atoms.Link
          overrideDefaults
          key={f.href}
          href={f.href}
          className={Libs.cn(
            'flex min-h-12 w-full min-w-40 items-center gap-x-2 border-b transition-colors hover:text-white lg:justify-center',
            pathname === f.href ? 'border-white text-white' : 'border-muted-foreground text-muted-foreground',
          )}
        >
          {f.href !== APP_ROUTES.HOME && f.href === pathname ? (
            <Organisms.CustomFeedDialog mode="edit">
              <Atoms.Button overrideDefaults className="cursor-pointer">
                {f.icon}
              </Atoms.Button>
            </Organisms.CustomFeedDialog>
          ) : (
            f.icon
          )}

          <Atoms.Typography overrideDefaults className="font-medium lg:text-sm">
            {f.name}
          </Atoms.Typography>
        </Atoms.Link>
      ))}

      <Organisms.CustomFeedDialog mode="create">
        <Atoms.Button
          overrideDefaults
          className="flex min-h-12 w-full min-w-40 cursor-pointer items-center gap-x-2 border-b border-muted-foreground text-muted-foreground transition-colors hover:text-white lg:justify-center"
        >
          <PlusCircle className="size-5 shrink-0" />

          <Atoms.Typography overrideDefaults className="font-medium lg:text-sm">
            {tDialog('createTitle')}
          </Atoms.Typography>
        </Atoms.Button>
      </Organisms.CustomFeedDialog>
    </Atoms.Container>
  );
};

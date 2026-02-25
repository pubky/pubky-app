'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import { APP_ROUTES } from '@/app/routes';
import { usePathname } from 'next/navigation';

export const FeedNavigation = () => {
  const pathname = usePathname();

  const customFeeds = useLiveQuery(
    async () => {
      try {
        return await Core.FeedController.getList();
      } catch (error) {
        Libs.Logger.error('[FeedNavigation] Failed to query custom feeds', { error });
        return [] as Core.FeedModelSchema[];
      }
    },
    [],
    [] as Core.FeedModelSchema[],
  );

  const customFeedsMapped = customFeeds.map((f) => ({
    name: f.name,
    icon: <Libs.Pencil className="size-5" />,
    href: APP_ROUTES.FEED + '/' + f.id,
  }));

  const feeds = [{ name: 'Home', icon: <Libs.Home className="size-5" />, href: APP_ROUTES.HOME }, ...customFeedsMapped];

  return (
    <Atoms.Container className="flex-row overflow-x-auto">
      {feeds.map((f) => (
        <Atoms.Link
          overrideDefaults
          key={f.href}
          href={f.href}
          className={Libs.cn(
            'flex h-12 w-full min-w-40 items-center justify-center gap-x-2 border-b transition-colors hover:text-white',
            pathname === f.href ? 'border-white text-white' : 'border-muted-foreground text-muted-foreground',
          )}
        >
          {f.name !== 'Home' && f.href === pathname ? (
            <Organisms.CustomFeedDialog mode="edit">
              <Atoms.Button variant="ghost" size="icon" className="size-9">
                {f.icon}
              </Atoms.Button>
            </Organisms.CustomFeedDialog>
          ) : (
            f.icon
          )}

          <Atoms.Typography overrideDefaults className="text-sm font-medium">
            {f.name}
          </Atoms.Typography>
        </Atoms.Link>
      ))}

      <Organisms.CustomFeedDialog mode="create">
        <Atoms.Button
          overrideDefaults
          className="flex h-12 w-full min-w-40 cursor-pointer items-center justify-center gap-x-2 border-b border-muted-foreground text-muted-foreground transition-colors hover:text-white"
        >
          <Libs.PlusCircle className="size-5" />

          <Atoms.Typography overrideDefaults className="text-sm font-medium">
            Create Feed
          </Atoms.Typography>
        </Atoms.Button>
      </Organisms.CustomFeedDialog>
    </Atoms.Container>
  );
};

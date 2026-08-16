'use client';

import { usePathname } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
// Module-level cache: survives remounts within the session so that
// navigating between /home and /feed/[id] doesn't flash empty tabs.
import { Home, Pencil, PlusCircle } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { FeedController } from '@/controllers/feed/feed';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { Logger } from '@/libs/logger/logger';
import { handleFeedNavClick } from '@/libs/utils/feedScrollTop';
import { cn } from '@/libs/utils/utils';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { CustomFeedDialog } from '../CustomFeedDialog/CustomFeedDialog';

const FEED_TAB_CLASS =
  'relative flex min-h-12 w-full min-w-40 items-center justify-center gap-2 border-b py-1.5 lg:flex-1';
const FEED_TAB_LABEL_CLASS = 'truncate text-sm font-medium leading-5';
const FEED_TAB_PENCIL_CLASS =
  'absolute top-1/2 right-3 z-10 -translate-y-1/2 cursor-pointer text-muted-foreground transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100';

let cachedFeeds: FeedModelSchema[] = [];
interface FeedNavigationProps {
  className?: string;
}

export const FeedNavigation = ({ className }: FeedNavigationProps) => {
  const pathname = usePathname();
  const { isAuthenticated, requireAuth } = useRequireAuth();
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

  return (
    <Container className={cn('w-full overflow-x-auto lg:flex-row', className)}>
      <Heading level={2} size="lg" className="mb-2 font-light text-muted-foreground lg:hidden">
        {'Feed'}
      </Heading>

      <Link
        overrideDefaults
        href={APP_ROUTES.HOME}
        onClick={(event) =>
          handleFeedNavClick(event, {
            isActive: pathname === APP_ROUTES.HOME,
            smoothScrollWhenActive: true,
          })
        }
        className={cn(
          FEED_TAB_CLASS,
          pathname === APP_ROUTES.HOME
            ? 'border-white text-white'
            : 'border-border text-muted-foreground hover:text-white',
        )}
      >
        <Home className="size-5 shrink-0" />
        <Typography overrideDefaults className={FEED_TAB_LABEL_CLASS}>
          {'Home'}
        </Typography>
      </Link>

      {customFeeds.map((feed) => {
        const href = `${APP_ROUTES.FEED}/${feed.id}`;
        const isActive = pathname === href;

        return (
          <div key={href} className={cn('group', FEED_TAB_CLASS, isActive ? 'border-white' : 'border-border')}>
            <Link
              overrideDefaults
              href={href}
              onClick={(event) =>
                handleFeedNavClick(event, {
                  isActive,
                  smoothScrollWhenActive: false,
                })
              }
              className={cn(
                'flex h-full w-full min-w-0 items-center justify-center pr-6',
                isActive ? 'text-white' : 'text-muted-foreground group-hover:text-white',
              )}
            >
              <Typography overrideDefaults className={FEED_TAB_LABEL_CLASS}>
                {feed.name}
              </Typography>
            </Link>
            <CustomFeedDialog mode="edit" feed={feed}>
              <Button overrideDefaults type="button" aria-label={`Edit ${feed.name}`} className={FEED_TAB_PENCIL_CLASS}>
                <Pencil className="size-3" />
              </Button>
            </CustomFeedDialog>
          </div>
        );
      })}

      {isAuthenticated ? (
        <CustomFeedDialog mode="create">
          <Button
            overrideDefaults
            className={cn(FEED_TAB_CLASS, 'cursor-pointer border-border text-muted-foreground hover:text-white')}
          >
            <PlusCircle className="size-5 shrink-0" />
            <Typography overrideDefaults className={FEED_TAB_LABEL_CLASS}>
              {'Feed'}
            </Typography>
          </Button>
        </CustomFeedDialog>
      ) : (
        <Button
          overrideDefaults
          className={cn(FEED_TAB_CLASS, 'cursor-pointer border-border text-muted-foreground hover:text-white')}
          onClick={() => requireAuth(() => undefined)}
        >
          <PlusCircle className="size-5 shrink-0" />
          <Typography overrideDefaults className={FEED_TAB_LABEL_CLASS}>
            {'Feed'}
          </Typography>
        </Button>
      )}
    </Container>
  );
};

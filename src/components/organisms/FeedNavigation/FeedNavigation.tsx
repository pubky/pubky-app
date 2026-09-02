'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, PlusCircle } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { DynamicLucideIcon } from '@/atoms/DynamicLucideIcon/DynamicLucideIcon';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { FULL_BLEED_GUTTER_CLASS } from '@/config/layoutClasses';
import { FeedController } from '@/controllers/feed/feed';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useSelectedReachFilter } from '@/hooks/useSelectedReachFilter/useSelectedReachFilter';
import { Logger } from '@/libs/logger/logger';
import { preloadLucideIcons } from '@/libs/lucide/lucideIcons';
import { handleFeedNavClick } from '@/libs/utils/feedScrollTop';
import { cn } from '@/libs/utils/utils';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { REACH_FILTER_META } from '@/molecules/Filters/FilterReach/FilterReach';
import { REACH } from '@/stores/home/home.types';
import { CustomFeedDialog } from '../CustomFeedDialog/CustomFeedDialog';

// Below lg the strip is a sticky tab bar under the compact mobile header:
// the selected tab shows icon + label, the rest collapse to icon-only cells.
// At lg+ every tab is icon + label. Content-aware flex bases let a longer
// title use space that a shorter sibling does not need before truncating.
const FEED_TAB_CLASS = 'relative flex min-h-12 items-center justify-center gap-2 border-b py-1.5 lg:min-w-40';
// Below lg the active tab hugs its label, but a feed name has no length limit
// (specs does not cap it), so cap the tab or one long name pushes every other
// tab off-screen; the label's `truncate` then does its job.
const FEED_TAB_ACTIVE_WIDTH_CLASS = 'max-w-[60%] flex-none lg:max-w-none lg:flex-auto';
const FEED_TAB_INACTIVE_WIDTH_CLASS = 'min-w-12 flex-1 lg:flex-auto';
// With no custom feeds the strip is just All + Create. An equal flex basis
// splits it 50/50; `flex-1`'s zero basis would not, because border-box padding
// (px-8 active vs px-2) floors each item before the free space is shared.
const FEED_TAB_EQUAL_CELL_CLASS = 'min-w-0 basis-1/2 lg:flex-auto';
// Symmetric horizontal padding keeps every label centered; the active padding
// also reserves the zone the edit pencil overlays on custom feed tabs.
const FEED_TAB_ACTIVE_PADDING_CLASS = 'px-8';
// The visible mobile pencil overlays the active custom feed tab. Slightly
// wider symmetric padding preserves centering while separating it from the
// feed name; desktop returns to the shared tab padding.
const CUSTOM_FEED_TAB_ACTIVE_PADDING_CLASS = 'px-10 lg:px-8';
const FEED_TAB_INACTIVE_PADDING_CLASS = 'px-2 lg:px-8';
const FEED_TAB_LABEL_CLASS = 'truncate text-sm font-medium leading-5';
// Hover-capable devices at lg+ park the pencil invisible AND non-interactive
// until the tab is hovered or holds focus; hover-less devices (iPads, touch
// laptops) can never fire :hover, so there the pencil stays visible — hiding
// it would make editing undiscoverable while leaving an invisible tap target.
const FEED_TAB_PENCIL_CLASS =
  'absolute top-1/2 right-1 z-10 -translate-y-1/2 cursor-pointer p-2 text-muted-foreground transition-opacity [@media(hover:hover)]:lg:pointer-events-none [@media(hover:hover)]:lg:opacity-0 lg:group-hover:pointer-events-auto lg:group-hover:opacity-100 lg:group-focus-within:pointer-events-auto lg:group-focus-within:opacity-100';

let cachedFeeds: FeedModelSchema[] = [];
interface FeedNavigationProps {
  className?: string;
}

export const FeedNavigation = ({ className }: FeedNavigationProps) => {
  const pathname = usePathname();
  const { isAuthenticated, requireAuth } = useRequireAuth();
  const [editingFeed, setEditingFeed] = useState<FeedModelSchema | null>(null);
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

  // `editingFeed` is a snapshot taken when the pencil was clicked. Drop it when
  // the session ends or when a background sync removes that feed, so the dialog
  // cannot outlive its record and fail the save with a generic error.
  useEffect(() => {
    if (!isAuthenticated) {
      setEditingFeed(null);
      return;
    }
    setEditingFeed((current) => (current && customFeeds.some((feed) => feed.id === current.id) ? current : null));
  }, [isAuthenticated, customFeeds]);

  // Warm the icon chunk cache as soon as feed data lands so tab icons paint
  // without a visible swap.
  useEffect(() => {
    preloadLucideIcons(customFeeds.map((feed) => feed.icon));
  }, [customFeeds]);

  // The first tab mirrors the reach selection the sidebar filter shows. The
  // fallback covers a persisted reach outside the known set (corrupted or
  // rolled-back storage) — better an All tab than a crashed feed page.
  const selectedReach = useSelectedReachFilter();
  const { label: reachLabel, icon: ReachIcon } = REACH_FILTER_META[selectedReach] ?? REACH_FILTER_META[REACH.ALL];
  const isHomeActive = pathname === APP_ROUTES.HOME;
  const hasCustomFeeds = customFeeds.length > 0;
  // The active content-hug exists so custom-feed tabs can use the freed space.
  // With no custom feeds it would skew the two-tab strip toward All, so there
  // both tabs keep the even split.
  const tabWidthClass = hasCustomFeeds ? FEED_TAB_INACTIVE_WIDTH_CLASS : FEED_TAB_EQUAL_CELL_CLASS;
  // One class list for the Create button in both auth branches, so the two
  // renders cannot drift apart.
  const createFeedButtonClass = cn(
    FEED_TAB_CLASS,
    tabWidthClass,
    FEED_TAB_INACTIVE_PADDING_CLASS,
    'cursor-pointer border-border text-muted-foreground hover:text-white',
  );

  return (
    <Container
      className={cn(
        // Full-bleed below lg: cancel ContentLayout's mobile gutter so the tab
        // strip runs edge-to-edge; w-auto lets the negative margins widen the
        // border-box (w-full would fight them).
        FULL_BLEED_GUTTER_CLASS,
        'w-auto lg:w-full',
        // The sticky chrome and gradient fade live on this non-scrolling
        // wrapper — on the scroll container itself the ::after fade would be
        // clipped into the scrollport and add phantom vertical scroll.
        'mobile-menu-gradient-fade sticky top-(--header-height-settings) z-(--z-mobile-menu) bg-background',
        'lg:static lg:top-auto lg:z-auto lg:bg-transparent lg:after:hidden',
        className,
      )}
    >
      <Container overrideDefaults className="flex w-full flex-row overflow-x-auto">
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
            hasCustomFeeds && isHomeActive ? FEED_TAB_ACTIVE_WIDTH_CLASS : tabWidthClass,
            isHomeActive ? FEED_TAB_ACTIVE_PADDING_CLASS : FEED_TAB_INACTIVE_PADDING_CLASS,
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
            <Container
              overrideDefaults
              key={href}
              className={cn(
                'group',
                FEED_TAB_CLASS,
                // The link is the sole in-flow child, so it carries the
                // horizontal padding and gives the collapsed (flex-none) tab
                // its content width; the pencil overlays the right padding.
                isActive ? FEED_TAB_ACTIVE_WIDTH_CLASS : FEED_TAB_INACTIVE_WIDTH_CLASS,
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
                  isActive ? CUSTOM_FEED_TAB_ACTIVE_PADDING_CLASS : FEED_TAB_INACTIVE_PADDING_CLASS,
                  isActive ? 'text-white' : 'text-muted-foreground group-hover:text-white',
                )}
              >
                <DynamicLucideIcon name={feed.icon} className="size-5 shrink-0" />
                <Typography overrideDefaults className={cn(FEED_TAB_LABEL_CLASS, !isActive && 'hidden lg:inline')}>
                  {feed.name}
                </Typography>
              </Link>
              <Button
                overrideDefaults
                type="button"
                aria-label={`Edit ${feed.name}`}
                onClick={() => setEditingFeed(feed)}
                className={cn(FEED_TAB_PENCIL_CLASS, !isActive && 'hidden lg:block')}
              >
                <Pencil className="size-4" />
              </Button>
            </Container>
          );
        })}

        {isAuthenticated ? (
          <CustomFeedDialog mode="create">
            <Button overrideDefaults aria-label="Create feed" className={createFeedButtonClass}>
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
            className={createFeedButtonClass}
            onClick={() => requireAuth(() => undefined)}
          >
            <PlusCircle className="size-5 shrink-0" />
            <Typography overrideDefaults className={cn(FEED_TAB_LABEL_CLASS, 'hidden lg:inline')}>
              {'Feed'}
            </Typography>
          </Button>
        )}
      </Container>

      {/* One edit dialog for the whole strip — mounting a form per tab would
          re-seed N closed dialogs on every feeds-table emission. */}
      {editingFeed && (
        <CustomFeedDialog
          mode="edit"
          feed={editingFeed}
          open
          onOpenChange={(open) => {
            if (!open) setEditingFeed(null);
          }}
        />
      )}
    </Container>
  );
};

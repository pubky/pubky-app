'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { captureViewerSession } from '@/controllers/tag/tag-cache.utils';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useSelectedReachFilter } from '@/hooks/useSelectedReachFilter/useSelectedReachFilter';
import { Logger } from '@/libs/logger/logger';
import { preloadLucideIcons } from '@/libs/lucide/lucideIcons';
import { handleFeedNavClick } from '@/libs/utils/feedScrollTop';
import { cn } from '@/libs/utils/utils';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { REACH_FILTER_META } from '@/molecules/Filters/FilterReach/FilterReach';
import { useAuthStore } from '@/stores/auth/auth.store';
import { REACH } from '@/stores/home/home.types';
import { CustomFeedDialog } from '../CustomFeedDialog/CustomFeedDialog';

// Below lg the strip is a sticky tab bar under the compact mobile header:
// the selected tab shows icon + label, the rest collapse to icon-only cells.
// At lg+ every tab is icon + label. Content-aware flex bases let a longer
// title use space that a shorter sibling does not need before truncating.
const FEED_TAB_CLASS = 'relative flex min-h-12 items-center justify-center gap-2 border-b py-1.5';
// Below lg the active tab hugs its label, but a feed name has no length limit
// (specs does not cap it), so cap the tab or one long name pushes every other
// tab off-screen; the label's `truncate` then does its job.
const FEED_TAB_ACTIVE_WIDTH_CLASS = 'max-w-[60%] flex-none lg:max-w-none lg:flex-auto';
const FEED_TAB_INACTIVE_WIDTH_CLASS = 'min-w-12 flex-1 lg:flex-auto';
// With no custom feeds the strip is just All + Create. An equal flex basis
// splits it 50/50; `flex-1`'s zero basis would not, because border-box padding
// (px-8 active vs px-2) floors each item before the free space is shared.
const FEED_TAB_EQUAL_CELL_CLASS = 'min-w-0 basis-1/2 lg:flex-auto';
// Below lg keep the previous padding: active Home is px-8, the visible mobile
// pencil needs px-10 on an active custom feed, and icon-only cells stay px-2.
// At lg+ every tab uses Figma Text Wrapper spacing/2-5 (10px).
const FEED_TAB_ACTIVE_PADDING_CLASS = 'px-8 lg:px-2.5';
const CUSTOM_FEED_TAB_ACTIVE_PADDING_CLASS = 'px-10 lg:px-2.5';
const FEED_TAB_INACTIVE_PADDING_CLASS = 'px-2 lg:px-2.5';
const FEED_TAB_LABEL_CLASS = 'truncate text-sm font-medium leading-5';
// Hover-capable devices at lg+ park the pencil invisible AND non-interactive
// until the tab is hovered or holds focus; hover-less devices (iPads, touch
// laptops) can never fire :hover, so there the pencil stays visible — hiding
// it would make editing undiscoverable while leaving an invisible tap target.
const FEED_TAB_PENCIL_CLASS =
  'absolute top-1/2 right-1 z-10 -translate-y-1/2 cursor-pointer p-2 text-muted-foreground transition-opacity [@media(hover:hover)]:lg:pointer-events-none [@media(hover:hover)]:lg:opacity-0 lg:group-hover:pointer-events-auto lg:group-hover:opacity-100 lg:group-focus-within:pointer-events-auto lg:group-focus-within:opacity-100';

let cachedFeeds: FeedModelSchema[] = [];
/**
 * Last horizontal offset of the tab strip, and the sign-in that produced it.
 *
 * `/home` and `/feed/[id]` render different templates, so the strip unmounts on
 * every feed switch and a fresh DOM node starts at `scrollLeft: 0`, so the tab
 * the user just picked would jump back to the first one (#2442). Kept in module
 * state next to `cachedFeeds`.
 *
 * `isCurrentSession` is `captureViewerSession()` taken when the offset was
 * recorded, so an offset cannot outlive its sign-in: a logout, or a sign-in as
 * the same account, is a different session. The check still holds when this
 * component is off screen for the whole auth transition, which is the case for
 * Profile and Settings, where nothing renders here while signed out.
 */
let cachedTabStripScrollLeft: { isCurrentSession: () => boolean; left: number } | null = null;
interface FeedNavigationProps {
  className?: string;
}

export const FeedNavigation = ({ className }: FeedNavigationProps) => {
  const pathname = usePathname();
  const { isAuthenticated, requireAuth } = useRequireAuth();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const tabStripRef = useRef<HTMLDivElement | null>(null);
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

  // The tab strip is a horizontal scroll container, and a fresh DOM node always
  // starts at `scrollLeft: 0`. Re-apply the offset the user left behind, once
  // the tabs are in the DOM: assigning `scrollLeft` while the row is still empty
  // is clamped by the browser to 0, so this re-runs on every tab/route change and
  // settles on the browser's own maximum when the saved offset no longer fits
  // (the previous active tab was the wide one, or the account has fewer feeds).
  //
  // The account is a dependency so the strip follows a sign-in change that
  // happens while it is on screen; the saved offset itself is dropped whenever
  // the sign-in that produced it is gone, including one that ended while this
  // component was unmounted and never saw a signed-out render.
  useLayoutEffect(() => {
    const row = tabStripRef.current;
    if (!row) return;
    if (cachedTabStripScrollLeft && !cachedTabStripScrollLeft.isCurrentSession()) {
      cachedTabStripScrollLeft = null;
    }
    const savedLeft = cachedTabStripScrollLeft?.left ?? 0;
    if (row.scrollLeft !== savedLeft) {
      row.scrollLeft = savedLeft;
    }
  }, [currentUserPubky, customFeeds, pathname]);

  // Record where the user scrolled the strip to, against the sign-in that was
  // live at that moment. A programmatic restore lands here too (the browser
  // fires a scroll event for the assignment), which only re-saves the value just
  // applied, clamped to what the row can reach.
  const handleTabStripScroll = (event: React.UIEvent<HTMLDivElement>) => {
    cachedTabStripScrollLeft = {
      isCurrentSession: captureViewerSession(),
      left: event.currentTarget.scrollLeft,
    };
  };

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
      <Container
        overrideDefaults
        ref={tabStripRef}
        onScroll={handleTabStripScroll}
        className="flex w-full flex-row overflow-x-auto"
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
                <Pencil className="size-3" />
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

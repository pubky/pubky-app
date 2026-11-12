import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { cn, truncateMiddle } from '@/libs/utils/utils';
import { getDisplayLink, getHttpUrl, getLinkHost } from '@/molecules/ResourceCard/ResourceCard.utils';
import { CARD_MUTED_TEXT, ResourceCardHeader } from '@/molecules/ResourceCard/ResourceCardFrame';
import { useResourceSurface } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { PostActionsBarSkeleton } from '@/organisms/PostActionsBar/PostActionsBar.skeleton';

// Only Tags carries a count (wider); Reply, Post about this, Save and ⋯ are icon-only.
const RESOURCE_ACTION_BUTTON_WIDTHS = ['w-12', 'w-9', 'w-9', 'w-9', 'w-9'];
/** A longer link shows as its start, "..." and its end in the title (the full link in its tooltip). */
const LINK_TITLE_MAX_LENGTH = 30;

interface ResourceCardSkeletonProps {
  /** Also hold the place of the bottom zone (tags and the post's action buttons); not while composing. */
  withActions?: boolean;
  /** `large`: the resource page's large card: its surface and wider padding, bigger image and title from `sm`. */
  size?: 'default' | 'large';
  /**
   * The link being read, known before its card: the title (as the link's own preview shows it,
   * shortened), a web link's site in the header, and "Loading details..." under the title.
   */
  link?: string;
  /** The real bottom zone (tags and the post's action buttons) in place of its skeleton. */
  actions?: ReactNode;
}

/** A skeleton piece that stands out on the card's frame, which is the app skeleton's own colour. */
function SkeletonPiece({ className }: { className?: string }) {
  return <Skeleton className={cn('bg-foreground/10 motion-reduce:animate-none', className)} />;
}

/**
 * Loading state of `ResourceCard`, in its frame: type and source on top, image and title beside
 * it, then the bottom zone (the tags' "+", then the action buttons, as on a post).
 * In a post it is announced as busy ("Loading link preview"). A card that is the item itself or
 * sits in a quoted post (`ResourceSurfaceProvider` `card`) loads on the post card's surface, as the
 * large card does.
 *
 * Given the `link` and its `actions` (the resource page, while Pinakes reads the link), it shows
 * what is known without the card instead of their skeletons, and says the rest is loading with the
 * app's loading row (the save picker's "Loading collections...").
 */
export function ResourceCardSkeleton({
  withActions = false,
  size = 'default',
  link,
  actions,
}: ResourceCardSkeletonProps) {
  const isLarge = size === 'large';
  const onCard = useResourceSurface() === 'card' || isLarge;
  const linkUrl = link ? getHttpUrl(link) : null;
  return (
    <Container
      overrideDefaults
      data-testid="resource-card-skeleton"
      data-size={size}
      aria-busy="true"
      className={cn(
        'flex w-full min-w-0 flex-col overflow-hidden rounded-md bg-embed',
        onCard && 'bg-card text-card-foreground shadow-sm',
      )}
    >
      <Container
        overrideDefaults
        className={cn('flex flex-col gap-3', link && CARD_MUTED_TEXT, isLarge ? 'p-6' : 'p-4')}
      >
        {/* Read in place of the card; the resource page names its own loading section. */}
        {!isLarge && <span className="sr-only">Loading link preview</span>}
        {link && linkUrl ? (
          // The link's own preview's header (`ResourceLinkCard`): its site, from the link alone.
          <ResourceCardHeader typeLabel={null} sourceUri={link} href={linkUrl} siteName={getLinkHost(link)} />
        ) : (
          <Container overrideDefaults className="flex items-center justify-between gap-3">
            <SkeletonPiece className="h-4 w-20 rounded-md" />
            <SkeletonPiece className="h-4 w-24 rounded-md" />
          </Container>
        )}
        <Container overrideDefaults className="flex gap-4">
          <SkeletonPiece className={cn('shrink-0 rounded-md', isLarge ? 'size-24 sm:size-40' : 'size-20 sm:size-24')} />
          <Container className="min-w-0 flex-1 gap-2">
            {link ? (
              <>
                <Typography
                  as="h2"
                  overrideDefaults
                  dir="auto"
                  title={link}
                  data-testid="resource-card-skeleton-title"
                  // The card's title (`ResourceLinkCard`, `ResourceCard`).
                  className={
                    isLarge
                      ? 'text-xl font-bold wrap-anywhere text-foreground sm:text-2xl'
                      : 'text-base font-bold wrap-anywhere text-foreground'
                  }
                >
                  {truncateMiddle(linkUrl ? getDisplayLink(link) : link, LINK_TITLE_MAX_LENGTH)}
                </Typography>
                {/* The save picker's loading row (`PostSavePicker`), as a status. */}
                <Container overrideDefaults role="status" className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  <Typography overrideDefaults className="text-base font-medium">
                    {'Loading details...'}
                  </Typography>
                </Container>
              </>
            ) : (
              <SkeletonPiece className={cn('w-48 max-w-full rounded-md', isLarge ? 'h-7 sm:h-8 sm:w-72' : 'h-5')} />
            )}
            <SkeletonPiece className="h-4 w-full rounded-md" />
            <SkeletonPiece className="h-4 w-32 rounded-md" />
          </Container>
        </Container>
      </Container>
      {actions}
      {withActions && !actions && (
        <Container
          overrideDefaults
          data-testid="resource-card-skeleton-actions"
          className={cn(
            'flex flex-col items-start gap-3 md:flex-row md:justify-between md:gap-4 @max-xl/grid:flex-col! @max-xl/grid:items-start! @max-xl/grid:gap-3!',
            isLarge ? 'px-6 py-4' : 'px-4 py-3',
          )}
        >
          <SkeletonPiece className="size-8 rounded-md" />
          <PostActionsBarSkeleton widths={RESOURCE_ACTION_BUTTON_WIDTHS} surface={onCard ? 'default' : 'muted'} />
        </Container>
      )}
    </Container>
  );
}

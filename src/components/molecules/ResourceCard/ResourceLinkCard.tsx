'use client';

import { type ReactNode, useState } from 'react';
import { getResourceRoute } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import { cn } from '@/libs/utils/utils';
import { GenericPreview } from '@/molecules/PostLinkEmbeds/Providers/Generic/GenericPreview';
import { useIsPostPreviewNavigable } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import { getDisplayLink, getHttpUrl, getLinkHost } from './ResourceCard.utils';
import { CARD_MUTED_TEXT, ResourceCardFrame, ResourceCardHeader } from './ResourceCardFrame';

interface ResourceLinkCardProps {
  /** The link as written in the post. */
  url: string;
  /** The action row and tag bar; absent while composing. */
  actions?: ReactNode;
  /**
   * `large`: atop the link's own resource page, as `ResourceCard`'s large card: the title is its
   * heading and no link, the source ("Open in <site>") is its one link out, and the card is no click-through.
   */
  size?: 'default' | 'large';
}

/**
 * An external resource Pinakes has no card for: the link's own preview (its Open Graph title and
 * image) in the same frame as a card, with the host as the source on the right and the same
 * actions. Without a preview the link itself, without its scheme, is the title (a link that is not
 * web, such as `isbn:`, keeps its scheme and has no preview). The title and a click on the card open
 * the link's resource page; the source opens the link.
 *
 * A link the preview reads as an image, video or audio file keeps `GenericPreview`, which shows or
 * plays it inline; not on the resource page (`large`), which keeps the frame and its footer.
 */
export function ResourceLinkCard({ url, actions, size = 'default' }: ResourceLinkCardProps) {
  const linkUrl = getHttpUrl(url);
  const { metadata, isLoading } = useOgMetadata(linkUrl ? url : null);
  const navigable = useIsPostPreviewNavigable();
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const isLarge = size === 'large';

  if (isLoading) return <ResourceCardSkeleton withActions={Boolean(actions)} size={size} />;
  if (metadata && metadata.type !== 'website' && !isLarge) return <GenericPreview url={url} />;

  const title = metadata?.title?.trim() || (linkUrl ? getDisplayLink(url) : url);
  const imageUrl = getHttpUrl(metadata?.image);
  const showImage = imageUrl !== null && failedImage !== imageUrl;
  // The large card heads the link's own page: no click-through to it.
  const clickThroughUrl = linkUrl && !isLarge ? getResourceRoute(url) : null;

  return (
    <ResourceCardFrame
      clickThroughUrl={clickThroughUrl}
      // The large card stands where a post stands on its page, on the post card's surface (`ResourceCard`).
      className={cn(isLarge && [CARD_MUTED_TEXT, 'bg-card text-card-foreground shadow-sm'])}
      data-testid="resource-link-card"
      data-size={size}
    >
      <Container
        overrideDefaults
        className={cn('flex min-w-0 flex-col gap-3', isLarge ? 'p-6' : 'p-4', clickThroughUrl && 'cursor-pointer')}
      >
        <ResourceCardHeader typeLabel={null} sourceUri={url} href={linkUrl} siteName={getLinkHost(url)} />
        <Container overrideDefaults className="flex min-w-0 gap-4">
          {showImage && (
            <Image
              src={imageUrl}
              alt=""
              width={isLarge ? 160 : 96}
              height={isLarge ? 160 : 96}
              data-testid="resource-link-card-image"
              onError={() => setFailedImage(imageUrl)}
              className={cn(
                'shrink-0 rounded-md object-cover object-center',
                isLarge ? 'size-24 sm:size-40' : 'size-20 sm:size-24',
              )}
            />
          )}
          {/* Like a card's title: the page's heading on the large card, else a link to the resource's
              page (in a new tab where links may not navigate). */}
          {isLarge ? (
            <Typography
              as="h2"
              overrideDefaults
              dir="auto"
              data-testid="resource-link-card-title"
              className="min-w-0 flex-1 text-xl font-bold wrap-anywhere text-foreground sm:text-2xl"
            >
              {title}
            </Typography>
          ) : linkUrl ? (
            <Link
              href={getResourceRoute(url)}
              target={navigable ? undefined : '_blank'}
              rel={navigable ? undefined : 'noopener noreferrer'}
              overrideDefaults
              data-testid="resource-link-card-title"
              className="min-w-0 flex-1 text-base font-bold wrap-anywhere text-foreground hover:text-brand"
            >
              {title}
            </Link>
          ) : (
            <Typography data-testid="resource-link-card-title" className="min-w-0 flex-1 font-bold wrap-anywhere">
              {title}
            </Typography>
          )}
        </Container>
      </Container>

      {actions}
    </ResourceCardFrame>
  );
}

'use client';

import { type ReactNode, useState } from 'react';
import { getResourceRoute } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import { getImageRetryUrl, getLinkImageUrl } from '@/libs/image/resourceImage';
import { cn } from '@/libs/utils/utils';
import { GenericPreview } from '@/molecules/PostLinkEmbeds/Providers/Generic/GenericPreview';
import { useIsPostPreviewNavigable } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import { getDisplayLink, getHttpUrl, getLinkHost } from './ResourceCard.utils';
import { CARD_MUTED_TEXT, ResourceCardFrame, ResourceCardHeader } from './ResourceCardFrame';
import { ResourceCardMedia } from './ResourceCardMedia';

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
  /** The type the header names (a platform's link with no card: "Video", "Post"); none by default. */
  typeLabel?: string | null;
  /** The title instead of the preview's (a file link's name). */
  title?: string;
  /**
   * Always this frame, also for a link the preview reads as an image, video or audio file (which is
   * else handed to `GenericPreview`): a file link's finished card. It is no click-through and its title
   * no link: a file's resource page has nothing more to show or play.
   */
  keepFrame?: boolean;
  /** In the header, before the source: a platform's link's Play (`PostLinkEmbeds`). */
  headerControl?: ReactNode;
  /**
   * A platform's player loaded inside the card by `headerControl`: under the title, in the image's
   * place, its own controls (never a click-through).
   */
  player?: ReactNode;
  /**
   * Images from the app's image route to show under the title at a post's media size, tried in order
   * (the next once one fails to load), then the preview's own image: a video's still. Without them
   * the preview's own image shows beside the title.
   */
  images?: readonly string[];
}

/**
 * An external resource Pinakes has no card for: the link's own preview (its Open Graph title and
 * image) in the same frame as a card, with the host as the source on the right and the same
 * actions. Without a preview the link itself, without its scheme, is the title (a link that is not
 * web, such as `isbn:`, keeps its scheme and has no preview, nor a source link: it is never a link
 * out). The title and a click on the card open the link's resource page; the source opens the link.
 *
 * A link the preview reads as an image, video or audio file keeps `GenericPreview`, which shows or
 * plays it inline; not on the resource page (`large`), which keeps the frame and its footer. There,
 * while the preview is read, its skeleton shows the link and the footer, as while Pinakes reads it.
 *
 * A platform's link with no card (a YouTube or Vimeo video, an X post: `PostLinkEmbeds`) is this card
 * with its Play in the header (`headerControl`), its thumbnail under the title (`images`) and, once
 * pressed, the platform's player in the thumbnail's place (`player`): a finished view from the app's
 * own origin until the press.
 */
export function ResourceLinkCard({
  url,
  actions,
  size = 'default',
  typeLabel = null,
  title: givenTitle,
  keepFrame = false,
  headerControl,
  player,
  images,
}: ResourceLinkCardProps) {
  const linkUrl = getHttpUrl(url);
  const { metadata, isLoading } = useOgMetadata(linkUrl ? url : null);
  const navigable = useIsPostPreviewNavigable();
  const [failedImage, setFailedImage] = useState<string | null>(null);
  // The preview image whose route answer failed once: asked once more before it is left out.
  const [retried, setRetried] = useState<string | null>(null);
  // How many of `images` failed to load: the next one shows.
  const [failedMedia, setFailedMedia] = useState(0);
  const isLarge = size === 'large';

  if (isLoading) {
    return isLarge ? (
      <ResourceCardSkeleton size={size} link={url} actions={actions} />
    ) : (
      <ResourceCardSkeleton withActions={Boolean(actions)} size={size} />
    );
  }
  if (metadata && metadata.type !== 'website' && !isLarge && !keepFrame) return <GenericPreview url={url} />;

  const title = givenTitle || metadata?.title?.trim() || (linkUrl ? getDisplayLink(url) : url);
  // The preview's image from the app's image route, never its host.
  const routeImage = getLinkImageUrl(url, getHttpUrl(metadata?.image));
  const imageUrl = routeImage && retried === routeImage ? getImageRetryUrl(routeImage) : routeImage;
  const showImage = !images && imageUrl !== null && failedImage !== routeImage;
  // Under the title: `images` in order, then the preview's own image, each from the image route.
  const mediaImage = images ? ([...images, routeImage][failedMedia] ?? null) : null;
  // The large card heads the link's own page: no click-through to it.
  const clickThroughUrl = isLarge || keepFrame ? null : getResourceRoute(url);

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
        <ResourceCardHeader
          typeLabel={typeLabel}
          sourceUri={url}
          href={linkUrl}
          siteName={getLinkHost(url)}
          control={headerControl}
        />
        <Container overrideDefaults className="flex min-w-0 gap-4">
          {showImage && (
            <Image
              src={imageUrl}
              alt=""
              width={isLarge ? 160 : 96}
              height={isLarge ? 160 : 96}
              data-testid="resource-link-card-image"
              onError={() => (retried === routeImage ? setFailedImage(routeImage) : setRetried(routeImage))}
              className={cn(
                'shrink-0 rounded-md object-cover object-center',
                isLarge ? 'size-24 sm:size-40' : 'size-20 sm:size-24',
              )}
            />
          )}
          {/* Like a card's title: the page's heading on the large card, else a link to the resource's
              page (in a new tab where links may not navigate). */}
          {keepFrame && !isLarge ? (
            <Typography
              as="span"
              overrideDefaults
              dir="auto"
              data-testid="resource-link-card-title"
              className="min-w-0 flex-1 text-base font-bold wrap-anywhere text-foreground"
            >
              {title}
            </Typography>
          ) : isLarge ? (
            <Typography
              as="h2"
              overrideDefaults
              dir="auto"
              data-testid="resource-link-card-title"
              className="min-w-0 flex-1 text-xl font-bold wrap-anywhere text-foreground sm:text-2xl"
            >
              {title}
            </Typography>
          ) : (
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
          )}
        </Container>
        {player ? (
          // A player loaded in the card: its own controls, never a click-through.
          <Container
            overrideDefaults
            data-resource-controls
            data-testid="resource-link-card-player"
            className="min-w-0 cursor-auto"
          >
            {player}
          </Container>
        ) : (
          mediaImage && (
            <ResourceCardMedia
              imageUrl={mediaImage}
              name={title}
              onImageError={() => setFailedMedia((count) => count + 1)}
            />
          )
        )}
      </Container>

      {actions}
    </ResourceCardFrame>
  );
}

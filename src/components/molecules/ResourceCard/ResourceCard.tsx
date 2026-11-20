'use client';

import { useState } from 'react';
import { CalendarDays, CircleAlert, CircleOff, Clock, CloudOff, type LucideProps, MapPin } from 'lucide-react';
import { getResourceRoute } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { useIsPostPreviewNavigable } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { PinakesStatus } from '@/services/pinakes/pinakes.types';
import { type ResourceCardProps, ResourceFamily } from './ResourceCard.types';
import {
  formatResourceDates,
  formatResourcePoint,
  getDisplayLink,
  getEventStatusNote,
  getHttpUrl,
  getResourceFamily,
  getResourceLinks,
  getResourceStatus,
  getResourceTypeLabel,
  hasWideImage,
} from './ResourceCard.utils';
import { ResourceCardFrame, ResourceCardHeader } from './ResourceCardFrame';

/** What a card that is not `ok` says about itself. Only `missing` has a documented meaning (`/llms.txt`). */
const STATUS_NOTES: Readonly<
  Record<Exclude<PinakesStatus, PinakesStatus.OK>, { text: string; icon: React.ComponentType<LucideProps> }>
> = {
  [PinakesStatus.PENDING]: { text: 'Details not read yet', icon: Clock },
  [PinakesStatus.MISSING]: { text: 'No longer available at the source', icon: CircleOff },
  [PinakesStatus.UNREACHABLE]: { text: 'The source could not be reached', icon: CloudOff },
  [PinakesStatus.ERROR]: { text: 'Details could not be read', icon: CircleAlert },
};

const DETAIL_ICON_SIZE = 14;

/**
 * One card for every external resource Pinakes knows, whatever its type, shown the way the app
 * shows an embedded post: inside the post's frame, the type in plain words on the left and the
 * source (site icon and name, never the full link) on the right, then image, title, description
 * and the details of the type's family (when an event happens, where a place is) when the card
 * carries them. A video's, movie's or series' image is a 16:9 thumbnail, every other a square. A card
 * that is not `ok` says so and shows what it still has. `actions` (the bottom zone: action row and
 * tags) close the card.
 *
 * The whole card is a click-through to the link, unless its actions' ⋯ menu lists other services
 * (`hasAlsoOn`: the same thing on other services too, `also_on`), where the viewer picks the
 * service; the source is its link either way.
 *
 * The title opens the resource's page (`/resource?uri=<card.uri>`), or links out where links may
 * not navigate (the composer, a dialog). The `large` card heads that page: a heading title, "Open in
 * <site>" as its one link out, an unclamped description, a bigger image and no click-through.
 *
 * Only `http(s)` values become external links or images; every text field is rendered as text.
 */
export function ResourceCard({ card, href, actions, hasAlsoOn = false, size = 'default' }: ResourceCardProps) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const navigable = useIsPostPreviewNavigable();

  const status = getResourceStatus(card.status);
  const family = getResourceFamily(card);
  const typeLabel = getResourceTypeLabel(card);
  const { linkUrl, sourceUri, siteName } = getResourceLinks(card, href);
  const isLarge = size === 'large';
  // With other services, the viewer picks one in the ⋯ menu; the large card links out by its header only.
  const clickThroughUrl = hasAlsoOn || isLarge ? null : linkUrl;
  const title = card.name || getDisplayLink(href || card.uri);
  const imageUrl = getHttpUrl(card.image);
  const showImage = imageUrl !== null && failedImage !== imageUrl;
  const isWideImage = hasWideImage(card);

  const dates = family === ResourceFamily.EVENT ? formatResourceDates(card) : null;
  const venue = family === ResourceFamily.EVENT ? card.venue?.name?.trim() || null : null;
  // An event's venue by name when the card has one, its point otherwise.
  const point = family !== ResourceFamily.WEB && !venue && card.point ? formatResourcePoint(card.point) : null;
  const eventStatusNote = family === ResourceFamily.EVENT ? getEventStatusNote(card.event_status) : null;
  const statusNote = status === PinakesStatus.OK ? null : STATUS_NOTES[status];
  // A `missing` card's link is gone upstream: the large card's source does not send the viewer there.
  const titleUrl = status === PinakesStatus.MISSING ? null : linkUrl;
  const smallTitleUrl = navigable ? getResourceRoute(card.uri) : linkUrl;

  return (
    <ResourceCardFrame
      clickThroughUrl={clickThroughUrl}
      // The large card stands where a post stands on its page, on the post card's surface.
      className={cn(isLarge && 'bg-card text-card-foreground shadow-sm')}
      data-testid="resource-card"
      data-status={status}
      data-family={family}
      data-size={size}
    >
      <Container
        overrideDefaults
        className={cn('flex min-w-0 flex-col gap-3', isLarge ? 'p-6' : 'p-4', clickThroughUrl && 'cursor-pointer')}
      >
        <ResourceCardHeader
          typeLabel={typeLabel}
          sourceUri={sourceUri}
          href={isLarge ? titleUrl : linkUrl}
          siteName={siteName}
        />

        <Container overrideDefaults className="flex min-w-0 gap-4">
          {showImage && (
            <Image
              src={imageUrl}
              alt=""
              width={isWideImage ? (isLarge ? 256 : 160) : isLarge ? 160 : 96}
              height={isWideImage ? (isLarge ? 144 : 90) : isLarge ? 160 : 96}
              data-testid="resource-card-image"
              data-shape={isWideImage ? 'wide' : 'square'}
              onError={() => setFailedImage(imageUrl)}
              className={cn(
                'shrink-0 rounded-md object-cover object-center',
                isWideImage && (isLarge ? 'aspect-video w-40 sm:w-64' : 'aspect-video w-28 sm:w-40'),
                !isWideImage && (isLarge ? 'size-24 sm:size-40' : 'size-20 sm:size-24'),
              )}
            />
          )}

          <Container className="min-w-0 flex-1 gap-1.5">
            {isLarge ? (
              <Typography
                as="h2"
                overrideDefaults
                className="text-xl font-bold wrap-anywhere text-foreground sm:text-2xl"
              >
                {/* Not a link: the header's "Open in <site>" is the one way to the same place. */}
                <span data-testid="resource-card-title">{title}</span>
              </Typography>
            ) : smallTitleUrl ? (
              <Link
                href={smallTitleUrl}
                overrideDefaults
                data-testid="resource-card-title"
                className="text-base font-bold wrap-anywhere text-foreground hover:text-brand"
              >
                {title}
              </Link>
            ) : (
              <Typography data-testid="resource-card-title" className="font-bold wrap-anywhere">
                {title}
              </Typography>
            )}

            {card.description && (
              <Typography
                size="sm"
                data-testid="resource-card-description"
                className={cn('font-normal wrap-anywhere text-muted-foreground', !isLarge && 'line-clamp-2')}
              >
                {card.description}
              </Typography>
            )}

            {dates && <ResourceDetail icon={CalendarDays} text={dates} testId="resource-card-dates" />}
            {venue && <ResourceDetail icon={MapPin} text={venue} testId="resource-card-venue" />}
            {point && <ResourceDetail icon={MapPin} text={point} testId="resource-card-point" />}
            {eventStatusNote && (
              <ResourceDetail icon={CircleAlert} text={eventStatusNote} testId="resource-card-event-status" />
            )}
            {card.attribution && (
              <Typography
                size="xs"
                data-testid="resource-card-attribution"
                className="font-normal wrap-anywhere text-muted-foreground"
              >
                {card.attribution}
              </Typography>
            )}
            {statusNote && (
              <ResourceDetail icon={statusNote.icon} text={statusNote.text} testId="resource-card-status" />
            )}
          </Container>
        </Container>
      </Container>

      {actions}
    </ResourceCardFrame>
  );
}

function ResourceDetail({
  icon: Icon,
  text,
  testId,
}: {
  icon: React.ComponentType<LucideProps>;
  text: string;
  testId: string;
}) {
  return (
    <Container data-testid={testId} className="flex-row items-center gap-1.5 text-muted-foreground">
      <Icon size={DETAIL_ICON_SIZE} aria-hidden="true" className="shrink-0" />
      <Typography as="span" size="sm" className="font-normal wrap-anywhere text-muted-foreground">
        {text}
      </Typography>
    </Container>
  );
}

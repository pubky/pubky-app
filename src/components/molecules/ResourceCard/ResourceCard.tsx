'use client';

import { useId, useState } from 'react';
import {
  CalendarDays,
  CircleAlert,
  CircleOff,
  Clock,
  CloudOff,
  Globe,
  type LucideProps,
  MapPin,
  Users,
} from 'lucide-react';
import { getResourceRoute } from '@/app/routes';
import { Audio } from '@/atoms/Audio/Audio';
import { Badge } from '@/atoms/Badge/Badge';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import { cn } from '@/libs/utils/utils';
import { useIsPostPreviewNavigable } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { PinakesStatus, type TPinakesCredit } from '@/services/pinakes/pinakes.types';
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
import { ResourceCardMedia } from './ResourceCardMedia';
import { ResourceCredits } from './ResourceCredits';
import { getCardAttribution, getMapDataCredit, getShownCredits } from './ResourceCredits.utils';
import { ResourceFactList } from './ResourceFactList';
import { getResourceDetailRows, getResourceSummary } from './ResourceFacts.utils';
import { getResourceTypeIcon } from './ResourceTypeIcon';
import { useResourceFallback } from './useResourceFallback';

/** What a card that is not `ok` says about itself. Only `missing` has a documented meaning (`/llms.txt`). */
const STATUS_NOTES: Readonly<
  Record<Exclude<PinakesStatus, PinakesStatus.OK>, { text: string; icon: React.ComponentType<LucideProps> }>
> = {
  [PinakesStatus.PENDING]: { text: 'Details are still being read', icon: Clock },
  [PinakesStatus.MISSING]: { text: 'No longer available at the source', icon: CircleOff },
  [PinakesStatus.UNREACHABLE]: { text: 'The source could not be reached', icon: CloudOff },
  [PinakesStatus.ERROR]: { text: 'Details could not be read', icon: CircleAlert },
};

/** How an event is attended, when not only in person (`attendance`). */
const ATTENDANCE_LABELS: Readonly<Record<string, string>> = {
  online: 'Online',
  mixed: 'Online and in person',
};

/** A large card's description longer than this is clamped on a phone, with "More". */
const LONG_DESCRIPTION_CHARS = 280;

const DETAIL_ICON_SIZE = 14;

/**
 * Keeps the card's own grey text above 4.5:1 on the embed and large-card surfaces in both themes.
 * Set on the body only, so the reused footer (tags and actions) looks as it does on a post.
 */
const CARD_MUTED_TEXT =
  '[--color-muted-foreground:color-mix(in_oklab,var(--foreground)_58%,var(--embed))] light:[--color-muted-foreground:color-mix(in_oklab,var(--foreground)_66%,var(--embed))]';

/**
 * One card for every external resource Pinakes knows, in the frame of an embedded post: the type
 * and source on top, then the image (or the type's icon), the title, a summary line of the type's
 * facts (`getResourceSummary`) and the description. An event leads with its dates, venue,
 * organizer and attendance; a card with an audio `stream` (an episode, or a recording's preview)
 * plays it. A sparse card fills a missing description or image from a general database in its
 * group (`useResourceFallback`), then a missing title or image from the link's OpenGraph data.
 *
 * The title opens the resource's page (the link where links may not navigate). The card is a
 * click-through to the link unless its ⋯ menu lists Also on or its link is gone (`missing`); the
 * `large` card heads the resource page, lists every fact under "Details" and is no click-through.
 * Only `http(s)` values become links, images or audio.
 */
export function ResourceCard({
  card,
  href,
  actions,
  hasAlsoOn = false,
  size = 'default',
  isOnScreen = true,
}: ResourceCardProps) {
  const navigable = useIsPostPreviewNavigable();
  const [expanded, setExpanded] = useState(false);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [wasOnScreen, setWasOnScreen] = useState(isOnScreen);
  if (isOnScreen && !wasOnScreen) setWasOnScreen(true);

  const status = getResourceStatus(card.status);
  const isMissing = status === PinakesStatus.MISSING;
  const family = getResourceFamily(card);
  const isEvent = family === ResourceFamily.EVENT;
  const typeLabel = getResourceTypeLabel(card);
  const { linkUrl, sourceUri, siteName } = getResourceLinks(card, href);
  const isLarge = size === 'large';
  // A `missing` card's own link is gone upstream: neither the card, its heading nor its source
  // send the viewer there.
  const titleUrl = isMissing ? null : linkUrl;
  // With other services, the viewer picks one in the ⋯ menu; the large card links out by its header only.
  const clickThroughUrl = hasAlsoOn || isLarge ? null : titleUrl;
  const smallTitleUrl = navigable ? getResourceRoute(card.uri) : titleUrl;
  const descriptionId = useId();
  // A feed card reads what it lacks (its group, the link's preview) once it has been on screen.
  const canFillIn = isLarge || wasOnScreen;

  const imageUrl = getHttpUrl(card.image);
  const description = card.description?.trim() || null;
  // An own image that failed to load leaves the slot to a group member's, like no image at all.
  const ownImageShown = imageUrl !== null && !failedImages.includes(imageUrl);
  const fallback = useResourceFallback(card, {
    description: canFillIn && !description,
    image: canFillIn && !ownImageShown,
    skipImages: failedImages,
  });
  const cardImage = ownImageShown ? imageUrl : (fallback.image?.value ?? null);
  const usableCardImage = cardImage && !failedImages.includes(cardImage) ? cardImage : null;
  // A title or image the card still lacks comes from the link's own preview (`/api/og-metadata`),
  // asked once the group has answered so a group image is never first replaced by the OG one.
  const needsOg =
    canFillIn && titleUrl !== null && !fallback.pending && (!card.name?.trim() || usableCardImage === null);
  const { metadata: og } = useOgMetadata(needsOg ? titleUrl : null);
  const ogImage = getHttpUrl(og?.image);
  const shownImage = usableCardImage ?? (ogImage && !failedImages.includes(ogImage) ? ogImage : null);
  const title = card.name?.trim() || og?.title?.trim() || getDisplayLink(href || card.uri);
  const shownDescription = description ?? fallback.description?.value ?? null;

  const summary = getResourceSummary(card);
  const dates = isEvent ? formatResourceDates(card) : null;
  const venue = isEvent ? card.venue?.name?.trim() || null : null;
  const organizer = isEvent ? getOrganizer(card, venue) : null;
  const attendance = isEvent ? (ATTENDANCE_LABELS[card.attendance?.trim().toLowerCase() ?? ''] ?? null) : null;
  // Coordinates only for a place or event that has nothing better to say where it is.
  const point =
    family !== ResourceFamily.WEB && !venue && !summary && card.point ? formatResourcePoint(card.point) : null;
  const eventStatusNote = isEvent ? getEventStatusNote(card.event_status) : null;
  const statusNote = status === PinakesStatus.OK ? null : STATUS_NOTES[status];
  // OpenStreetMap is credited once, under the resource page's Sources ("Map data"), not on every
  // card; another source's credit stays on the card.
  const cardAttribution = getCardAttribution(card.attribution);
  const mapCredit = isLarge ? getMapDataCredit(card.attribution) : null;
  // Any audio `stream` plays: an episode's enclosure or a recording's public preview.
  const streamUrl = card.stream && card.stream.type?.startsWith('audio/') ? getHttpUrl(card.stream.url) : null;

  const credits = [
    ...getShownCredits(card, { imageShown: ownImageShown }),
    ...[fallback.description?.credit, usableCardImage && !ownImageShown ? fallback.image?.credit : null].filter(
      (credit): credit is TPinakesCredit => credit != null,
    ),
  ];
  const detailRows = isLarge ? getResourceDetailRows(card, { withDates: !isEvent }) : [];
  const isLongDescription = isLarge && (shownDescription?.length ?? 0) > LONG_DESCRIPTION_CHARS;
  const clampOnPhone = isLongDescription && !expanded;

  const eventDetails = (dates || venue || organizer || attendance) && (
    <>
      {dates && <ResourceDetail icon={CalendarDays} text={dates} testId="resource-card-dates" />}
      {venue && <ResourceDetail icon={MapPin} text={venue} testId="resource-card-venue" />}
      {organizer && (
        <ResourceDetail icon={Users} testId="resource-card-organizer">
          by{' '}
          {organizer.href ? (
            <Link href={organizer.href} overrideDefaults className="hover:text-brand hover:underline">
              {organizer.name}
            </Link>
          ) : (
            organizer.name
          )}
        </ResourceDetail>
      )}
      {attendance && (
        <Badge variant="secondary" data-testid="resource-card-attendance">
          <Globe aria-hidden="true" />
          {attendance}
        </Badge>
      )}
    </>
  );

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
        className={cn(
          'flex min-w-0 flex-col gap-3',
          CARD_MUTED_TEXT,
          isLarge ? 'p-6' : 'p-4',
          clickThroughUrl && 'cursor-pointer',
        )}
      >
        <ResourceCardHeader typeLabel={typeLabel} sourceUri={sourceUri} href={titleUrl} siteName={siteName} />

        <Container overrideDefaults className="flex min-w-0 gap-4">
          <ResourceCardMedia
            imageUrl={shownImage}
            typeIcon={getResourceTypeIcon(card)}
            wideByType={hasWideImage(card)}
            isLarge={isLarge}
            dimmed={isMissing}
            onImageError={(url) => setFailedImages((urls) => [...urls, url])}
          />

          <Container className="min-w-0 flex-1 gap-1.5">
            {statusNote && (
              <Badge variant="secondary" data-testid="resource-card-status" className="max-w-full whitespace-normal">
                <statusNote.icon aria-hidden="true" />
                {statusNote.text}
              </Badge>
            )}
            {isLarge ? (
              <Typography
                as="h2"
                overrideDefaults
                dir="auto"
                className={cn(
                  'text-xl font-bold wrap-anywhere text-foreground sm:text-2xl',
                  isMissing && 'text-foreground/70',
                )}
              >
                {/* Not a link: the header's "Open in <site>" is the one way to the same place. */}
                <span data-testid="resource-card-title">{title}</span>
              </Typography>
            ) : smallTitleUrl ? (
              <Link
                href={smallTitleUrl}
                overrideDefaults
                dir="auto"
                title={title}
                data-testid="resource-card-title"
                className="line-clamp-3 text-base font-bold wrap-anywhere text-foreground hover:text-brand"
              >
                {title}
              </Link>
            ) : (
              <Typography
                dir="auto"
                title={title}
                data-testid="resource-card-title"
                className="line-clamp-3 font-bold wrap-anywhere"
              >
                {title}
              </Typography>
            )}

            {summary && (
              <Typography
                size="sm"
                dir="auto"
                data-testid="resource-card-summary"
                title={summary}
                className="line-clamp-2 font-medium wrap-anywhere text-foreground/90"
              >
                {summary}
              </Typography>
            )}

            {/* An event leads with when and where. */}
            {eventDetails}

            {shownDescription && (
              <Typography
                size="sm"
                dir="auto"
                id={descriptionId}
                data-testid="resource-card-description"
                data-borrowed={description ? undefined : 'true'}
                className={cn(
                  'font-normal wrap-anywhere text-muted-foreground',
                  !isLarge && 'line-clamp-2',
                  clampOnPhone && 'max-sm:line-clamp-6',
                )}
              >
                {shownDescription}
              </Typography>
            )}
            {isLongDescription && (
              <Button
                type="button"
                variant={ButtonVariant.GHOST}
                data-testid="resource-card-more"
                aria-expanded={expanded}
                aria-controls={descriptionId}
                onClick={() => setExpanded((value) => !value)}
                className="h-auto w-fit p-0 text-sm font-medium text-foreground hover:bg-transparent hover:text-brand sm:hidden"
              >
                {expanded ? 'Less' : 'More'}
              </Button>
            )}

            {point && <ResourceDetail icon={MapPin} text={point} testId="resource-card-point" />}
            {eventStatusNote && (
              <ResourceDetail icon={CircleAlert} text={eventStatusNote} testId="resource-card-event-status" />
            )}
            {cardAttribution && (
              <Typography
                size="xs"
                data-testid="resource-card-attribution"
                className="font-normal wrap-anywhere text-muted-foreground"
              >
                {cardAttribution}
              </Typography>
            )}
          </Container>
        </Container>

        {streamUrl && (
          <Container overrideDefaults data-resource-controls className="flex flex-col gap-1">
            <Audio src={streamUrl} preload="none" data-testid="resource-card-audio" aria-label={`Play ${title}`} />
            {card.stream?.preview && (
              <Typography size="xs" className="font-normal text-muted-foreground">
                Preview
              </Typography>
            )}
          </Container>
        )}

        {isLarge && <ResourceFactList rows={detailRows} />}

        <ResourceCredits
          credits={mapCredit ? [...credits, mapCredit] : credits}
          variant={isLarge ? 'full' : 'compact'}
        />
      </Container>

      {actions}
    </ResourceCardFrame>
  );
}

/**
 * Who runs an event, linked when `http(s)`. Left out when it only repeats the venue or the
 * performer (a concert page names the artist as its organizer).
 */
function getOrganizer(
  card: ResourceCardProps['card'],
  venue: string | null,
): { name: string; href: string | null } | null {
  const name = card.organizer?.name?.trim();
  if (!name) return null;
  const performer = card.facts?.performer?.trim().toLowerCase();
  if (name.toLowerCase() === performer || name.toLowerCase() === venue?.toLowerCase()) return null;
  return { name, href: getHttpUrl(card.organizer?.url) };
}

function ResourceDetail({
  icon: Icon,
  text,
  testId,
  children,
}: {
  icon: React.ComponentType<LucideProps>;
  text?: string;
  testId: string;
  children?: React.ReactNode;
}) {
  return (
    <Container data-testid={testId} className="flex-row items-start gap-1.5 text-muted-foreground">
      <Icon size={DETAIL_ICON_SIZE} aria-hidden="true" className="mt-0.5 shrink-0" />
      <Typography as="span" size="sm" dir="auto" className="font-normal wrap-anywhere text-muted-foreground">
        {children ?? text}
      </Typography>
    </Container>
  );
}

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
  Repeat,
  Users,
} from 'lucide-react';
import { getResourceRoute } from '@/app/routes';
import { Audio } from '@/atoms/Audio/Audio';
import { Badge } from '@/atoms/Badge/Badge';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { useEventDates } from '@/hooks/useEventDates/useEventDates';
import { cn } from '@/libs/utils/utils';
import { useIsPostPreviewNavigable } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { getLocationRowText, isLocationRow, ResourceLocation } from '@/molecules/ResourceMap/ResourceLocation';
import { useResourceLocationVariant } from '@/molecules/ResourceMap/ResourceLocationContext';
import { getMapsDestination } from '@/molecules/ResourceMap/ResourceMap.utils';
import { ResourceAudioPlayer } from '@/molecules/ResourcePlayer/ResourceAudioPlayer';
import { showsEmbedImage } from '@/molecules/ResourcePlayer/resourcePlayer.utils';
import { PinakesStatus, type TPinakesCredit } from '@/services/pinakes/pinakes.types';
import { ResourceArrowText } from './ResourceArrowText';
import { type ResourceCardProps, ResourceFamily } from './ResourceCard.types';
import {
  formatOtherDates,
  formatResourceDates,
  formatResourcePoint,
  getDisplayLink,
  getEpisodeShow,
  getEventStatusNote,
  getHttpUrl,
  getPlayableEpisodes,
  getResourceFamily,
  getResourceLinks,
  getResourceStatus,
  getResourceTypeLabel,
  hasCoverArt,
  hasWideImage,
  OTHER_DATES_ANCHOR,
} from './ResourceCard.utils';
import { CARD_MUTED_TEXT, ResourceCardFrame, ResourceCardHeader } from './ResourceCardFrame';
import { ResourceCardCover, ResourceCardMedia, ResourceCardTypeTile } from './ResourceCardMedia';
import { ResourceChainBody, ResourceChainCopy, ResourceChainLines } from './ResourceChain';
import { getChainView } from './ResourceChain.utils';
import { ResourceCredits } from './ResourceCredits';
import { getCardAttribution, getMapDataCredit, getShownCredits } from './ResourceCredits.utils';
import { ResourceEpisodes } from './ResourceEpisodes';
import { ResourceFactList } from './ResourceFactList';
import {
  formatDuration,
  getBlockedNote,
  getResourceDetailRows,
  getResourceSummary,
  isBlockedCard,
} from './ResourceFacts.utils';
import { getResourcePost, RESOURCE_POST_FACTS, ResourcePost } from './ResourcePost';
import { useResourceSurface } from './ResourceSurfaceContext';
import { getResourceTypeIcon } from './ResourceTypeIcon';
import { useCardImage } from './useCardImage';

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
 * One card for every external resource Pinakes knows, in the frame of an embedded post: the type
 * and source on top, then the title with the card's image as a small thumbnail left of it
 * (`ResourceCardCover`; the type's icon when there is no image), a summary line of the type's facts
 * (`getResourceSummary`) and the description. An image that stands in for an embed
 * (`showsEmbedImage`: a video's, a post's) shows under them instead, as a post shows one
 * (`ResourceCardMedia`). An event leads with its dates, venue,
 * organizer and attendance; a card with an audio `stream` (an episode, or a recording's preview)
 * plays it, and a show its latest episodes (`ResourceEpisodes`). A sparse card fills a missing
 * description or image from a general database in its
 * group (`useResourceFallback`), then a missing title or image from the link's OpenGraph data
 * (never for a link whose site refused Pinakes' read, `isBlockedCard`: that page is a sign-in wall).
 *
 * The title opens the resource's page (in a new tab where links may not navigate), and so does a
 * click on the card outside its controls (`ResourceCardFrame`); a tap on the image opens it in the
 * post's lightbox. The header's source is the one link out (none on a `missing` card). A player or
 * embed in the body (`isBodyReplaced`) is its own set of controls, as the episode's audio is, and
 * takes the image's place too. An embed loaded inside the card (`player`: an X post's, platform embeds
 * up front off) sits under the text instead of a video's or a post's image under it, and the card stays. The `large` card heads
 * the resource page, lists every fact under "Details" (not while an X post's embed is its body,
 * `isBodyReplaced`), with one plain line in place of a refused read's `blocked` fact (`getBlockedNote`),
 * and is no click-through.
 * Only `http(s)` values become links, images or audio.
 */
export function ResourceCard({
  card,
  href,
  actions,
  size = 'default',
  isOnScreen = true,
  renderBody,
  isBodyReplaced = false,
  headerControl,
  player,
  asPost = false,
  imageUrl: ownImageUrl,
}: ResourceCardProps) {
  const navigable = useIsPostPreviewNavigable();
  const [expanded, setExpanded] = useState(false);
  const [wasOnScreen, setWasOnScreen] = useState(isOnScreen);
  if (isOnScreen && !wasOnScreen) setWasOnScreen(true);

  const status = getResourceStatus(card.status);
  const isMissing = status === PinakesStatus.MISSING;
  const family = getResourceFamily(card);
  const isEvent = family === ResourceFamily.EVENT;
  const typeLabel = getResourceTypeLabel(card);
  const { linkUrl, sourceUri, siteName } = getResourceLinks(card, href);
  const isLarge = size === 'large';
  // The large card and a collection's item stand on the post card's surface: their pills are the post's.
  const onCard = useResourceSurface() === 'card';
  // A `missing` card's own link is gone upstream: neither the card, its heading nor its source
  // send the viewer there.
  const titleUrl = isMissing ? null : linkUrl;
  // The title always opens the resource's page, as on the page itself; where links may not navigate
  // (the composer, a quoted post in a dialog) in a new tab, so the draft or dialog stays.
  const smallTitleUrl = getResourceRoute(card.uri);
  // So does a click on the card. The large card heads that page: its header's "Open in <site>" links
  // out, the card itself does not.
  const clickThroughUrl = isLarge ? null : smallTitleUrl;
  const titleTarget = navigable ? undefined : '_blank';
  const descriptionId = useId();
  // A feed card reads what it lacks (its group, the link's preview) once it has been on screen.
  const canFillIn = isLarge || wasOnScreen;

  // A refused read's description is Pinakes' "Blocked by the site.", not the object's: the resource
  // page's Details say it in words (`getBlockedNote`), a feed card shows its title alone.
  const description = isBlockedCard(card) ? null : card.description?.trim() || null;
  const { fallback, og, ownImageShown, usableCardImage, youTubeSrc, shownImageSrc, onShownImageError } = useCardImage(
    card,
    { canFillIn, ownImageUrl },
  );
  const title = card.name?.trim() || og?.title?.trim() || getDisplayLink(href || card.uri);
  const shownDescription = description ?? fallback.description?.value ?? null;

  // A social post shows as a post, from its card's data alone.
  const post = asPost ? getResourcePost(card) : null;
  // An image that stands in for an embed (a post's photo too) shows large under the text; every other
  // one is a small thumbnail beside it.
  const isEmbedImage = showsEmbedImage(card, { href, isPost: post !== null });

  // A Bitcoin or Lightning card shows its lines, with links to what it names, instead of a summary.
  const chain = getChainView(card);
  // Where a place or an event is: a map of its point, or a line ending in "Open in Maps"
  const destination = getMapsDestination(card);
  const locationVariant = useResourceLocationVariant();
  const locationRowText =
    destination && isLocationRow(destination, locationVariant) ? getLocationRowText(destination) : null;
  const cardSummary = chain ? null : getResourceSummary(card);
  // The location line says the address: the summary does not say it a second time
  const summary = cardSummary !== null && cardSummary === locationRowText ? null : cardSummary;
  // A transaction's ID in its title is shortened; the copy button and the title's tooltip have it whole.
  const shownTitle = chain?.title ?? title;
  const dates = isEvent ? formatResourceDates(card) : null;
  const venue = isEvent ? card.venue?.name?.trim() || null : null;
  const organizer = isEvent ? getOrganizer(card, venue) : null;
  const attendance = isEvent ? (ATTENDANCE_LABELS[card.attendance?.trim().toLowerCase() ?? ''] ?? null) : null;
  // A date of a series says how many other dates it has, once the card has been on screen; its page lists
  // them. Nothing shows while they are read or when they could not be: the line comes in once known.
  const series = useEventDates(card, { enabled: isEvent && !isLarge && wasOnScreen });
  const otherDates =
    isEvent && !isLarge && !series.isLoading && !series.isError
      ? formatOtherDates(series.sameName, series.hasMore, card.start)
      : null;
  // Coordinates only for a place or event that has nothing better to say where it is.
  const point =
    family !== ResourceFamily.WEB && !venue && !cardSummary && !locationRowText && card.point
      ? formatResourcePoint(card.point)
      : null;
  const eventStatusNote = isEvent ? getEventStatusNote(card.event_status) : null;
  const statusNote = status === PinakesStatus.OK ? null : STATUS_NOTES[status];
  // OpenStreetMap is credited once, under the resource page's Sources ("Map data"), not on every
  // card; another source's credit stays on the card.
  const cardAttribution = getCardAttribution(card.attribution);
  const mapCredit = isLarge ? getMapDataCredit(card.attribution) : null;
  // Any audio `stream` plays: an episode's enclosure or a recording's public preview.
  const streamUrl = card.stream && card.stream.type?.startsWith('audio/') ? getHttpUrl(card.stream.url) : null;
  // A show plays its latest episodes, each in the same player.
  const episodes = getPlayableEpisodes(card);
  // An episode names its show, linked to the show's page.
  const show = getEpisodeShow(card);

  const credits = [
    ...getShownCredits(card, { imageShown: ownImageShown }),
    ...[fallback.description?.credit, usableCardImage && !ownImageShown ? fallback.image?.credit : null].filter(
      (credit): credit is TPinakesCredit => credit != null,
    ),
  ];
  // An X post's embed in the large card's body (`isBodyReplaced`) shows who wrote it and when.
  const detailRows =
    isLarge && !isBodyReplaced
      ? getResourceDetailRows(card, { withDates: !isEvent }).filter(
          // A post's own lines already say who wrote it and when.
          (row) => !chain?.shownFacts.includes(row.key) && !(post && RESOURCE_POST_FACTS.includes(row.key)),
        )
      : [];
  const isLongDescription = isLarge && (shownDescription?.length ?? 0) > LONG_DESCRIPTION_CHARS;
  const clampOnPhone = isLongDescription && !expanded;

  const eventDetails = (dates || venue || organizer || attendance || otherDates) && (
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
      {otherDates && (
        <ResourceDetail icon={Repeat} testId="resource-card-other-dates">
          <Link
            href={`${smallTitleUrl}#${OTHER_DATES_ANCHOR}`}
            target={titleTarget}
            rel={titleTarget ? 'noopener noreferrer' : undefined}
            overrideDefaults
            className="hover:text-brand hover:underline"
          >
            {otherDates}
          </Link>
        </ResourceDetail>
      )}
    </>
  );

  // A chain card's ID is copied by a button next to its title, outside the heading's name.
  const withCopy = (heading: React.ReactNode) =>
    chain?.copy ? (
      <Container overrideDefaults className="flex min-w-0 items-start gap-1">
        {heading}
        <ResourceChainCopy copy={chain.copy} />
      </Container>
    ) : (
      heading
    );

  // A click on or around a player or embed in the body never opens the page. The wrapper stays
  // mounted, so opening or closing a player never remounts what the body renders.
  const showBody = (body: React.ReactNode) => (
    <Container
      overrideDefaults
      data-resource-controls={isBodyReplaced || undefined}
      className={cn('min-w-0', isBodyReplaced && 'cursor-auto')}
    >
      {(renderBody ?? keepBody)(body)}
    </Container>
  );

  return (
    <ResourceCardFrame
      clickThroughUrl={clickThroughUrl}
      // The large card stands where a post stands on its page, on the post card's surface.
      className={cn(isLarge && 'bg-card text-card-foreground shadow-sm')}
      data-testid="resource-card"
      // The card's root, for a control in it that hands the focus back to the card (`ResourcePostPress`).
      data-resource-card
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
        <ResourceCardHeader
          typeLabel={typeLabel}
          sourceUri={sourceUri}
          href={titleUrl}
          siteName={siteName}
          control={headerControl}
        />

        {showBody(
          <Container overrideDefaults className="flex min-w-0 flex-col gap-3">
            <Container overrideDefaults className="flex min-w-0 gap-4">
              {/* Left of the text: the card's image, small, or without one the type's icon. */}
              {!shownImageSrc && !post && (
                <ResourceCardTypeTile typeIcon={getResourceTypeIcon(card)} isLarge={isLarge} />
              )}
              {shownImageSrc && !isEmbedImage && (
                <ResourceCardCover
                  imageUrl={shownImageSrc}
                  name={title}
                  isLarge={isLarge}
                  wideByType={hasWideImage(card)}
                  square={youTubeSrc !== null && hasCoverArt(card)}
                  dimmed={isMissing}
                  onImageError={onShownImageError}
                />
              )}

              {post ? (
                <ResourcePost post={post} href={smallTitleUrl} linkTarget={titleTarget} isLarge={isLarge} />
              ) : (
                <Container className="min-w-0 flex-1 gap-1.5">
                  {statusNote && (
                    <Badge
                      variant="secondary"
                      data-testid="resource-card-status"
                      className="max-w-full whitespace-normal"
                    >
                      <statusNote.icon aria-hidden="true" />
                      {statusNote.text}
                    </Badge>
                  )}
                  {isLarge ? (
                    withCopy(
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
                        <span data-testid="resource-card-title" title={shownTitle === title ? undefined : title}>
                          {shownTitle}
                        </span>
                      </Typography>,
                    )
                  ) : (
                    <Link
                      href={smallTitleUrl}
                      target={titleTarget}
                      rel={titleTarget ? 'noopener noreferrer' : undefined}
                      overrideDefaults
                      dir="auto"
                      data-testid="resource-card-title"
                      className="line-clamp-3 text-base font-bold wrap-anywhere text-foreground hover:text-brand"
                    >
                      {shownTitle}
                    </Link>
                  )}

                  {show && (
                    <Typography
                      size="sm"
                      dir="auto"
                      data-testid="resource-card-show"
                      className="font-medium text-foreground/90"
                    >
                      From{' '}
                      <Link
                        href={getResourceRoute(show.uri)}
                        target={titleTarget}
                        rel={titleTarget ? 'noopener noreferrer' : undefined}
                        overrideDefaults
                        className="font-bold wrap-anywhere hover:text-brand"
                      >
                        {show.name || getDisplayLink(show.uri)}
                      </Link>
                    </Typography>
                  )}

                  {summary && (
                    <Typography
                      size="sm"
                      dir="auto"
                      data-testid="resource-card-summary"
                      className="line-clamp-2 font-medium wrap-anywhere text-foreground/90"
                    >
                      <ResourceArrowText text={summary} />
                    </Typography>
                  )}

                  {chain && <ResourceChainLines view={chain} isLarge={isLarge} target={titleTarget} />}

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
              )}
            </Container>
            {player ? (
              // A player loaded in the card: its own controls, never a click-through.
              <Container
                overrideDefaults
                data-resource-controls
                data-testid="resource-card-player"
                className="min-w-0 cursor-auto"
              >
                {player}
              </Container>
            ) : (
              shownImageSrc &&
              isEmbedImage && (
                <ResourceCardMedia
                  imageUrl={shownImageSrc}
                  name={title}
                  dimmed={isMissing}
                  onImageError={onShownImageError}
                />
              )
            )}
          </Container>,
        )}

        {destination && <ResourceLocation id={card.id} destination={destination} size={size} />}

        {/* An episode's whole audio plays in the app's player, Play beside its date and length. */}
        {streamUrl && !card.stream?.preview && (
          <Container overrideDefaults data-resource-controls className="min-w-0">
            <ResourceAudioPlayer
              src={streamUrl}
              resource={card.uri}
              title={title}
              hideTitle
              length={formatDuration(card.stream?.duration_s)}
              from={show?.name ?? null}
              image={shownImageSrc}
              surface={isLarge || onCard ? 'default' : 'muted'}
              data-testid="resource-card-audio"
            />
          </Container>
        )}
        {/* A recording's public preview: the browser's own player, marked as a preview. */}
        {streamUrl && card.stream?.preview && (
          <Container overrideDefaults data-resource-controls className="flex flex-col gap-1">
            <Audio src={streamUrl} preload="none" data-testid="resource-card-audio" aria-label={`Play ${title}`} />
            <Typography size="xs" className="font-normal text-muted-foreground">
              Preview
            </Typography>
          </Container>
        )}

        {episodes.length > 0 && (
          <ResourceEpisodes
            episodes={episodes}
            show={{ uri: card.uri, name: card.name, image: getHttpUrl(card.image) }}
            surface={isLarge || onCard ? 'default' : 'muted'}
          />
        )}
        {isLarge && chain && !isBodyReplaced && <ResourceChainBody view={chain} target={titleTarget} />}

        {isLarge && (
          <ResourceFactList rows={detailRows} note={isBodyReplaced ? null : getBlockedNote(card, siteName)} />
        )}

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

function keepBody(body: React.ReactNode): React.ReactNode {
  return body;
}

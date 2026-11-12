'use client';

import { Container } from '@/atoms/Container/Container';
import { isPinakesConfigured, PINAKES_SLOW_READ_MS } from '@/config/pinakes';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { useViewportObserver } from '@/hooks/useViewportObserver/useViewportObserver';
import { fileNameFromUrl, inferMediaKindFromUrl } from '@/libs/file/inlineMediaKind';
import { useIsPostPreviewNavigable } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { ResourceAlsoOn } from '@/molecules/ResourceCard/ResourceAlsoOn';
import { getMenuAlsoOn } from '@/molecules/ResourceCard/ResourceAlsoOn.utils';
import { ResourceCard } from '@/molecules/ResourceCard/ResourceCard';
import {
  getHttpUrl,
  getResourceLinks,
  getResourceStatus,
  getResourceTagsLabel,
  getResourceTarget,
} from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceEmbedFrame } from '@/molecules/ResourceCard/ResourceEmbedFrame';
import { ResourceLinkCard } from '@/molecules/ResourceCard/ResourceLinkCard';
import { useResourceSurface } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import { AnimatedHeight } from '@/molecules/ResourcePlayer/ResourcePlayerFrame';
import { useCardPlayer } from '@/molecules/ResourcePlayer/useCardPlayer';
import { ResourceActions } from '@/organisms/ResourceActions/ResourceActions';
import { PinakesStatus, type TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { GenericPreview } from './GenericPreview';
import { useSlowRead } from './useSlowRead';

const IMAGE_FILE_EXTENSION = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;

/**
 * A link straight to an image, video or audio file: `GenericPreview` shows or plays it inline, which
 * a card would replace, so such a link is not looked up in Pinakes. The media helpers read `https:`
 * links only, so an `http:` link (also what a link written without a scheme becomes) is read as its
 * `https:` form: only its file extension matters here.
 */
function isDirectMediaFile(url: string): boolean {
  const fileUrl = url.replace(/^http:/i, 'https:');
  const kind = inferMediaKindFromUrl(fileUrl);
  if (kind === 'video' || kind === 'audio') return true;
  const fileName = fileNameFromUrl(fileUrl);
  return fileName !== null && IMAGE_FILE_EXTENSION.test(fileName);
}

/**
 * A card with neither details nor a name says less than the link's own preview: a `pending` or
 * `error` card without a name shows the link's preview instead. A `missing` or `unreachable` card
 * is still shown, since it tells the viewer something about the link.
 */
function hasNothingToShow(card: TPinakesResourceDetail): boolean {
  const status = getResourceStatus(card.status);
  return !card.name && (status === PinakesStatus.PENDING || status === PinakesStatus.ERROR);
}

interface GenericResourcePreviewProps {
  url: string;
  /** The composer's preview: Pinakes reads the link at once, and it previews as a post being written. */
  isComposing?: boolean;
}

/**
 * The preview of the generic link a post embeds, as an external resource inside the post (a link that
 * is only in the post's text keeps `GenericPreview`, see `Generic.renderEmbed`): its Pinakes card when Pinakes
 * has one, else the link's own preview in the same frame (`ResourceLinkCard`), both closed by the
 * post's own footer (`ResourceActions`: tags, actions and a ⋯ menu that copies the link and the
 * title), which reads the link's tags once the card is first on screen, on the card's canonical link
 * with the link as written and its other spellings read along (`getResourceTarget`): every
 * spelling's tags, replies and saves show as one. A card on other services too (`also_on`) lists
 * them in the ⋯ menu under "Also on". A card that is pending or failed and has no name says less
 * than the link's own preview, and a failed read, or one slower than `PINAKES_SLOW_READ_MS` until it
 * is read (on demand included), is treated like an unknown link (no error box and no long skeleton
 * in a feed).
 *
 * Inside a quoted or reposted post (`PostPreviewCard`) the resource shows as in its own post: the
 * same card or player, with its footer. While composing, and in the Reply and Repost dialogs (a
 * post being written: `navigable` false), it previews: no card player opens and a song's player
 * never docks (`useCardPlayer`'s `preview`), while its footer tags and saves the resource before the
 * post is sent. The frame keeps its clicks and keys to itself (`ResourceCardFrame`), so they never
 * open the quoted post or reach the composer.
 *
 * Without a Pinakes origin configured no request is made and the plain `GenericPreview` renders;
 * a direct media file keeps it too, since it shows or plays the file inline.
 *
 * Embed or card (`useCardPlayer`): a link on a service with a player (a Spotify track or artist
 * page) shows that service's player up front, in the resource frame (`ResourceEmbedFrame`); a
 * generic link Pinakes knows on such services (a MusicBrainz or Wikipedia page) shows our card up
 * front. Either has the embed/card switch in its header when there is a choice (Card, then the
 * services), and no Play on in its action row; in a post, the composer and a collection alike. A
 * player plays only on a press inside it, and never docks in a post being written. A viewer who
 * turned platform embeds up front off (Settings, Links & Media) gets a stand-in that loads nothing
 * until its Play.
 *
 * A link Pinakes does not know yet (a post published seconds ago) is read again while the preview
 * is on screen (`usePinakesCard`'s `recheck`), and its card replaces the link's own preview in the
 * same box once Pinakes has read it, with no loading state in between. In the composer, Pinakes is
 * asked to read such a link right away (`resolve`) instead of re-reading it, so the published post
 * shows its card at once, and still has its own re-reads if Pinakes had not read it yet. While that
 * read is in flight, the composer's preview and the published post's show the skeleton (at most
 * `PINAKES_SLOW_READ_MS`). Outside the composer the box grows smoothly to the card (`AnimatedHeight`).
 */
export function GenericResourcePreview(props: GenericResourcePreviewProps) {
  const { ref, isVisible } = useViewportObserver({ rootMargin: '0px' });
  return (
    <Container overrideDefaults ref={ref} className="min-w-0" data-testid="resource-preview">
      {props.isComposing ? (
        // The composer measures and snaps its own height as its content grows.
        <ResourcePreview {...props} isOnScreen={isVisible} />
      ) : (
        // The box grows smoothly when the card replaces the link's own preview, or a player opens.
        <AnimatedHeight>
          <ResourcePreview {...props} isOnScreen={isVisible} />
        </AnimatedHeight>
      )}
    </Container>
  );
}

function ResourcePreview({
  url,
  isComposing = false,
  isOnScreen,
}: GenericResourcePreviewProps & { isOnScreen: boolean }) {
  // A card that is the item itself (a collection's) or sits in a quoted post stands on the post
  // card's surface: its player's pills are the post's own, as its footer's (`ResourceActions`).
  const actionSurface = useResourceSurface() === 'card' ? 'default' : undefined;
  const navigable = useIsPostPreviewNavigable();
  // A post being written (the composer, the Reply and Repost dialogs) previews the resource.
  const isPreview = isComposing || !navigable;
  const lookupUrl = isPinakesConfigured() && !isDirectMediaFile(url) ? url : null;
  // The composer has Pinakes read the link (`resolve`) and never re-reads it: a link's re-reads are
  // once per page load, kept for the post once it is published.
  const {
    data: card,
    isLoading,
    isResolving,
  } = usePinakesCard(lookupUrl, {
    recheck: isOnScreen && !isComposing,
    resolve: isComposing,
  });
  // While Pinakes reads a link it did not know (the composer's resolve, which a post just published
  // waits for too), the skeleton holds the place as for the first read, as a native embed's does.
  const isReading = isLoading || Boolean(isResolving);
  const isSlow = useSlowRead(lookupUrl, isReading, PINAKES_SLOW_READ_MS);
  // Embed or card, with the switch; in a post being written a player previews (`preview`).
  const { embed, switcher } = useCardPlayer(card && !hasNothingToShow(card) ? card : null, url, actionSurface, {
    preview: isPreview,
  });

  if (!lookupUrl) return <GenericPreview url={url} />;
  if (isReading && !isSlow) return <ResourceCardSkeleton withActions />;

  // A slow read gives way to the link's own preview; the card takes its place in the same box once read.
  const shownCard = card && !hasNothingToShow(card) ? card : null;
  // The ⋯ menu copies what the card links.
  const linkUrl = shownCard ? getResourceLinks(shownCard, url).linkUrl : getHttpUrl(url);
  // A card on other services too lists them in its ⋯ menu ("Also on"): one row per service, never
  // the card's own (`pickAlsoOn`).
  const alsoOn = shownCard ? getMenuAlsoOn(shownCard, url) : null;
  // The footer acts on the card's canonical link, its other spellings read along (`getResourceTarget`).
  const target = getResourceTarget(shownCard, url);
  const actions = (
    <ResourceActions
      uri={target.uri}
      spellings={target.spellings}
      postUri={url}
      collectionsCount={card?.collections}
      tagsLabel={getResourceTagsLabel(card)}
      linkUrl={linkUrl}
      title={shownCard?.name}
      card={shownCard}
      isOnScreen={isOnScreen}
      extraMenuContent={
        alsoOn
          ? ({ variant, closeMenu }) => <ResourceAlsoOn alsoOn={alsoOn} variant={variant} closeMenu={closeMenu} />
          : undefined
      }
    />
  );
  if (!shownCard) return <ResourceLinkCard url={url} actions={actions} />;
  // A service's player: in the resource frame, the switch in its header.
  if (embed) {
    return (
      <ResourceEmbedFrame url={url} card={shownCard} actions={actions} headerControl={switcher}>
        {embed}
      </ResourceEmbedFrame>
    );
  }
  return (
    <ResourceCard card={shownCard} href={url} actions={actions} isOnScreen={isOnScreen} headerControl={switcher} />
  );
}

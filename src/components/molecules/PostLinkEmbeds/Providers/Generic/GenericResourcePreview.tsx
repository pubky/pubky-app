'use client';

import { useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { isPinakesConfigured, PINAKES_SLOW_READ_MS } from '@/config/pinakes';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { useViewportObserver } from '@/hooks/useViewportObserver/useViewportObserver';
import { fileNameFromUrl, inferMediaKindFromUrl } from '@/libs/file/inlineMediaKind';
import { useIsNestedPostPreview } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
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
import { getEmbedTarget } from '@/molecules/ResourcePlayer/resourcePlayer.utils';
import { AnimatedHeight, ResourcePlayerFrame } from '@/molecules/ResourcePlayer/ResourcePlayerFrame';
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
  /** The composer's preview: the card without its action row and tag bar. */
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
 * is read, is treated like an unknown link (no error box and no long skeleton in a feed).
 *
 * Inside a quoted or reposted post (`PostPreviewCard`) the card has no action row or tag bar, as
 * while composing: that post is itself a link (or sits in the Reply/Repost dialog), so controls
 * there would nest in it. People act on the link where its own post renders.
 *
 * Without a Pinakes origin configured no request is made and the plain `GenericPreview` renders;
 * a direct media file keeps it too, since it shows or plays the file inline.
 *
 * A card on a service that allows embedding plays there in place (`useCardPlayer`: "Play on
 * <service>" in the action row, a dock when it scrolls away); not in the composer or a quoted post.
 *
 * A card on such a service with no Also on shows that service's embed up front instead, in the
 * resource frame (`ResourceEmbedFrame`), as `NativeEmbedResource` does for a video; in a post, the
 * composer and a collection alike. It plays only on a press inside it.
 *
 * A link Pinakes does not know yet (a post published seconds ago) is read again while the preview
 * is on screen (`usePinakesCard`'s `recheck`), and its card replaces the link's own preview in the
 * same box once Pinakes has read it, with no loading state in between. In the composer, Pinakes is
 * asked to read such a link right away (`resolve`) instead of re-reading it, so the published post
 * shows its card at once, and still has its own re-reads if Pinakes had not read it yet. Outside
 * the composer the box grows smoothly to the card (`AnimatedHeight`).
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
  const isNested = useIsNestedPostPreview();
  const lookupUrl = isPinakesConfigured() && !isDirectMediaFile(url) ? url : null;
  // The composer has Pinakes read the link (`resolve`) and never re-reads it: a link's re-reads are
  // once per page load, kept for the post once it is published.
  const { data: card, isLoading } = usePinakesCard(lookupUrl, {
    recheck: isOnScreen && !isComposing,
    resolve: isComposing,
  });
  const isSlow = useSlowRead(lookupUrl, isLoading, PINAKES_SLOW_READ_MS);
  // The up-front service embed that has loaded (see `embedTarget`); another link loads anew.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const withActions = !isComposing && !isNested;
  // A card with an action row plays its services in place; not while composing or in a quoted post.
  const { playOn, renderBody, isOpen } = useCardPlayer(
    withActions && card && !hasNothingToShow(card) ? card : null,
    url,
    actionSurface,
  );

  if (!lookupUrl) return <GenericPreview url={url} />;
  if (isLoading && !isSlow) return <ResourceCardSkeleton withActions={withActions} />;

  // A slow read gives way to the link's own preview; the card takes its place in the same box once read.
  const shownCard = card && !hasNothingToShow(card) ? card : null;
  // The ⋯ menu copies what the card links.
  const linkUrl = shownCard ? getResourceLinks(shownCard, url).linkUrl : getHttpUrl(url);
  // A card on other services too lists them in its ⋯ menu ("Also on"): one row per service, never
  // the card's own (`pickAlsoOn`).
  const cardAlsoOn = shownCard ? getMenuAlsoOn(shownCard, url) : null;
  const alsoOn = withActions ? cardAlsoOn : null;
  // No Also on and the link (or the card's canonical link) is on a service with an embed: that embed,
  // up front, in the resource frame.
  const embedTarget =
    !isNested && shownCard && !cardAlsoOn && getResourceStatus(shownCard.status) === PinakesStatus.OK
      ? getEmbedTarget(url, shownCard)
      : null;
  // The footer acts on the card's canonical link, its other spellings read along (`getResourceTarget`).
  const target = getResourceTarget(shownCard, url);
  const actions = !withActions ? null : (
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
      playOn={shownCard && !embedTarget ? playOn : undefined}
      extraMenuContent={
        alsoOn
          ? ({ variant, closeMenu }) => <ResourceAlsoOn alsoOn={alsoOn} variant={variant} closeMenu={closeMenu} />
          : undefined
      }
    />
  );
  if (!shownCard) return <ResourceLinkCard url={url} actions={actions} />;
  if (embedTarget) {
    return (
      <ResourceEmbedFrame url={url} card={shownCard} actions={actions}>
        <ResourcePlayerFrame
          target={embedTarget}
          title={shownCard.name?.trim() || url}
          load={loadedSrc === embedTarget.src ? 'ready' : 'loading'}
          onLoaded={() => setLoadedSrc(embedTarget.src)}
          quiet
        />
      </ResourceEmbedFrame>
    );
  }
  return (
    <ResourceCard
      card={shownCard}
      href={url}
      actions={actions}
      isOnScreen={isOnScreen}
      renderBody={renderBody}
      isBodyReplaced={isOpen}
    />
  );
}

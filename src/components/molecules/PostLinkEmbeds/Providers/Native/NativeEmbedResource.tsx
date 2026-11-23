'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { PINAKES_SLOW_READ_MS } from '@/config/pinakes';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { useViewportObserver } from '@/hooks/useViewportObserver/useViewportObserver';
import { prefetchXPost } from '@/hooks/useXPost/useXPost';
import { useIsPostPreviewNavigable } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { ResourceAlsoOn } from '@/molecules/ResourceCard/ResourceAlsoOn';
import { getMenuAlsoOn } from '@/molecules/ResourceCard/ResourceAlsoOn.utils';
import { ResourceCard } from '@/molecules/ResourceCard/ResourceCard';
import {
  getHttpUrl,
  getLinkHost,
  getResourceLinks,
  getResourceTagsLabel,
  getResourceTarget,
  playsInCard,
} from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceEmbedFrame } from '@/molecules/ResourceCard/ResourceEmbedFrame';
import { hasPostVideo, showsPostFromCard } from '@/molecules/ResourceCard/ResourcePost';
import { useResourceSurface } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { usePostPreviewImage } from '@/molecules/ResourceCard/usePostPreviewImage';
import { useXPostCard } from '@/molecules/ResourceCard/useXPostCard';
import { XPostPlayer } from '@/molecules/ResourceCard/XPostVideo';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import {
  getCategoryPlayers,
  getPlayerCategory,
  getPlayerTarget,
  getPlayerTargets,
  isCardFirstFor,
  isPlayable,
} from '@/molecules/ResourcePlayer/resourcePlayer.utils';
import { PlayOnPill, PlayOnPillPlaceholder } from '@/molecules/ResourcePlayer/ResourcePlayerControls';
import { AnimatedHeight } from '@/molecules/ResourcePlayer/ResourcePlayerFrame';
import { useCardPlayer } from '@/molecules/ResourcePlayer/useCardPlayer';
import { useFramePress } from '@/molecules/ResourcePlayer/useResourcePlayer';
import { ResourceActions } from '@/organisms/ResourceActions/ResourceActions';
import { getXPostVideo } from '@/pipes/x-post/x-post';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { useSlowRead } from '../Generic/useSlowRead';
import type { EmbedResourceKind } from '../Provider.types';
import { chooseNativeEmbed, getNativeEmbedCard, getShowPostLabel } from './nativeEmbed.utils';
import { NativeEmbedLinkCard } from './NativeEmbedLinkCard';

/**
 * Renders the platform's own embed; `onError` is called when the platform says it cannot show it.
 * `autoplay`: loaded by the viewer's press on Play on, so a video starts on load.
 */
export type RenderNativeEmbed = (options: { onError: () => void; autoplay?: boolean }) => ReactNode;

interface NativeEmbedResourceProps {
  /** The link as written: the post's embed. */
  url: string;
  kind: EmbedResourceKind;
  renderEmbed: RenderNativeEmbed;
  /**
   * The composer's preview: Pinakes is asked to read the link right away (`resolve`), so the
   * preview and the published post show its card; the same choice, with the footer.
   */
  isComposing?: boolean;
}

/**
 * `true` once the viewer has pressed inside the embed's frame (a press in an iframe moves the focus
 * there and blurs the page): from then on a card read later does not replace a playing embed.
 */
function useEmbedEngaged(box: React.RefObject<HTMLElement | null>): boolean {
  const [engaged, setEngaged] = useState(false);
  useFramePress(box, () => setEngaged(true), !engaged);
  return engaged;
}

/**
 * `false` while `box` is laid out nowhere (`getClientRects`, as `PlayerHost` reads its slots): inside
 * something hidden, as a feed kept behind an open post (`display: none`). Its size observer says so
 * as the box's size goes to nothing and back; laid out until it first does (none in the test DOM). A
 * box only scrolled away is laid out: this is not the viewport.
 */
function useIsLaidOut(box: React.RefObject<HTMLElement | null>): boolean {
  const [laidOut, setLaidOut] = useState(true);
  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setLaidOut(element.getClientRects().length > 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, [box]);
  return laidOut;
}

/**
 * A post's embedded X post, YouTube or Vimeo video as an external resource, embed or card. A video
 * Pinakes has read (`isPlayable`) shows its player up front (`useCardPlayer`'s `embed`) in the
 * resource frame, with the embed/card switch in the frame's header when it is on other services
 * too; or our card with the switch, when Card (no player) ranks above its service; unless the
 * platform's embed was pressed in or opened before the card was read. A video gone upstream that
 * Pinakes knows on such services shows our card, those services in the switch. Anything else (an
 * X post, a video with nothing else to play, no card) follows `chooseNativeEmbed`: the platform's
 * own embed in the resource frame, its only source, so with no switch and no Card, also when
 * Pinakes knows it elsewhere (Also on, in the ⋯ menu). A viewer who turned platform embeds up
 * front off (Settings, Links & Media) gets our card whenever there is one, the card staying: a
 * video's player loads inside it from its Play (`useCardPlayer`); an X post shows as a post from
 * the card's own data at once (`ResourcePost`, nothing asked from X), and a post the card cannot
 * tell (a video post) loads X's embed inside it from "Show on <site>". A link Pinakes does not know is
 * sent to be read once its box is near the screen (`resolveOnView`); with no card even then, the link's
 * own preview shows as a card (`NativeEmbedLinkCard`), the platform's Play in its header and its embed
 * inside it once pressed. The card's skeleton holds the place while Pinakes is read (at most
 * `PINAKES_SLOW_READ_MS`), so no embed loads only to be replaced. Nothing is read before the box first
 * comes near the screen.
 *
 * In the composer, and in the Reply and Repost dialogs (a post being written: `navigable` false),
 * the footer tags the resource before the post is sent, and a player never docks (`preview`).
 *
 * A video's own embed is unloaded while the box is hidden (a feed kept behind an open post) and
 * loaded again once shown, as `PlayerHost` does with the card player's frames: no live frame stays
 * behind. An X post has no frame of its own and stays.
 */
export function NativeEmbedResource(props: NativeEmbedResourceProps) {
  // The default margin: the box counts as near 200px before it scrolls in.
  const { ref, isVisible } = useViewportObserver();
  const box = useRef<HTMLDivElement>(null);
  const isLaidOut = useIsLaidOut(box);
  const [wasNear, setWasNear] = useState(false);
  if (isVisible && !wasNear) setWasNear(true);
  // The composer's preview is on screen; elsewhere the Pinakes read and the footer's reads wait.
  const choice =
    props.isComposing || wasNear ? (
      <NativeEmbedChoice {...props} isOnScreen={isVisible} isLaidOut={isLaidOut} />
    ) : (
      <ResourceCardSkeleton withActions />
    );
  return (
    <div
      ref={(node) => {
        ref(node);
        box.current = node;
      }}
      className="min-w-0"
      data-testid="native-embed-resource"
      data-kind={props.kind}
    >
      {/* The composer measures and snaps its own height; elsewhere the box grows smoothly. */}
      {props.isComposing ? choice : <AnimatedHeight>{choice}</AnimatedHeight>}
    </div>
  );
}

function NativeEmbedChoice({
  url,
  kind,
  renderEmbed,
  isComposing = false,
  isOnScreen,
  isLaidOut,
}: NativeEmbedResourceProps & { isOnScreen: boolean; isLaidOut: boolean }) {
  const embedsUpFront = useSettingsStore((state) => state.media.embedsUpFront);
  // With platform embeds up front off, a link Pinakes does not know is sent to be read once its box is
  // near the screen (`resolveOnView`), so it shows its card instead of waiting for a press.
  const { data, isLoading, isResolving } = usePinakesCard(
    url,
    isComposing ? { resolve: true } : { recheck: isOnScreen, resolveOnView: !embedsUpFront },
  );
  // In the composer a link Pinakes did not know is being read (`resolve`), and a post just published
  // waits for that read too, as does any link read on view: wait for it, so no platform embed loads only
  // to give way to the card.
  // An X post Pinakes' card cannot tell (none, or no text) is read by the app's own server as soon as the
  // card read has answered, without waiting for Pinakes to read the link.
  const pinakesCard = getNativeEmbedCard(data);
  const xPost = useXPostCard(pinakesCard, url, kind === 'post' && !embedsUpFront && !isLoading);
  const isReading = isLoading || xPost.pending || (Boolean(isResolving) && !xPost.card);
  const isSlow = useSlowRead(url, isReading, PINAKES_SLOW_READ_MS);
  const embedRef = useRef<HTMLDivElement>(null);
  const engaged = useEmbedEngaged(embedRef);
  const [failed, setFailed] = useState(false);
  const [isPostOpen, setIsPostOpen] = useState(false);
  // The embed was opened from the pill before Pinakes knew the link: a card read later keeps it.
  const [openedWithoutCard, setOpenedWithoutCard] = useState(false);
  const media = useSettingsStore((state) => state.media);
  const navigable = useIsPostPreviewNavigable();
  // A post being written (the composer, the Reply and Repost dialogs) previews the resource.
  const isPreview = isComposing || !navigable;

  const card = xPost.card;
  const alsoOn = pinakesCard ? getMenuAlsoOn(pinakesCard, url) : null;
  // Card (no player) above the video's service in Players: our card, its player from the switch.
  const videoProvider = kind === 'video' ? getPlayerTarget(url)?.provider : undefined;
  // The Players of its kind (`getPlayerCategory`: by the card's type, else Video for a video, else Music).
  const category = getPlayerCategory(card, videoProvider);
  const { playerOrder, hiddenPlayers } = getCategoryPlayers(media, category);
  const cardFirst =
    videoProvider !== undefined &&
    isCardFirstFor(category, videoProvider, playerOrder, card !== null && playsInCard(card));
  const upFront = embedsUpFront && !cardFirst;
  const choice = chooseNativeEmbed({
    hasCard: card !== null,
    embedFailed: failed,
    engaged: engaged || openedWithoutCard,
    upFront,
  });
  const showsCard = choice === 'card' && card !== null;
  const isVideo = kind === 'video';
  // A video the card player has a player for shows it, or our card, with the switch; any other link
  // (an `http:` video, one gone upstream with nothing else to play or on no service kept in
  // Players, an X post) offers the platform's embed.
  const hasCardPlayer =
    isVideo &&
    card !== null &&
    getPlayerTargets(card, { href: url, players: { playerOrder: [], hiddenPlayers } }).length > 0;
  // Platform embeds up front off (or Card (no player) above the video's service) and the frame's
  // choice (no card, or an embed opened or pressed in): the frame holds the embed until Play on /
  // Show on, so Close also closes an embed pressed in before a card was read.
  const isEmbedOnPress = !upFront && choice === 'embed';
  // A video Pinakes has read shows its player up front (`embed`), also in the composer, unless the
  // platform's embed was already pressed in or opened. An X post keeps X's embed.
  const showsPlayer = isVideo && card !== null && isPlayable(card, url) && !engaged && !openedWithoutCard;
  // On the post card's surface (a collection's item, a card in a quoted post) the player's pills and
  // Show on are the post's own, as in `ResourceActions`.
  const actionSurface = useResourceSurface() === 'card' ? 'default' : undefined;
  // An X post shows its video by its link preview's still (`hasPostVideo`): read as the card reads it.
  const postPreview = usePostPreviewImage(card, !embedsUpFront && kind === 'post' && showsCard);
  // Our card for a video the card player cannot play from its own link, or for a post X cannot show:
  // a generic card, its other services (Also on) in the switch.
  const player = useCardPlayer(showsPlayer || (showsCard && (isVideo || failed)) ? card : null, url, actionSurface, {
    preview: isPreview,
    previewImage: postPreview.image,
  });
  // Without a card, the player's name ("YouTube") as the card gives it, else the host ("x.com").
  const siteName = card ? getResourceLinks(card, url).siteName : (getPlayerTarget(url)?.name ?? getLinkHost(url));

  // With platform embeds up front off, a post our card can tell from its own data (author, text, date)
  // shows at once, as a post, with nothing asked from its site: no Show on. While its link preview,
  // which may name a video, is read, the pill's place is held.
  const isPostFromCard = !embedsUpFront && kind === 'post' && showsCard && showsPostFromCard(card, postPreview.image);
  // An X post on our card: the card player's pill (`PlayOnPill`) shows the post's embed in the body. The
  // same for a video on our card the card player cannot play, and for the frame of an embed opened
  // before its card was read. A link with no card shows its own preview as a card, the press in its
  // header (`NativeEmbedLinkCard`).
  // An embed opened there stays there when a card is read later, until it is closed.
  const inLinkCard = isEmbedOnPress && !embedsUpFront && (card === null || openedWithoutCard);
  const showPost =
    // Only where the pill could come: never in the composer, nor once X could not show the post.
    isPostFromCard && postPreview.pending && !isComposing && !failed ? (
      <PlayOnPillPlaceholder uri={url} surface={actionSurface} />
    ) : (showsCard && !hasCardPlayer && !isComposing && !failed && !isPostFromCard) ||
      (isEmbedOnPress && !inLinkCard) ? (
      <PlayOnPill
        uri={url}
        isOpen={isPostOpen}
        label={getShowPostLabel(
          siteName,
          isPostOpen,
          isVideo || (card !== null && hasPostVideo(card, postPreview.image)),
        )}
        aria-expanded={isPostOpen}
        surface={actionSurface}
        // Reaching for it starts reading the post, so its video is known by the press.
        onPointerDown={() => prefetchXPost(url)}
        onFocus={() => prefetchXPost(url)}
        onClick={() => {
          setIsPostOpen(!isPostOpen);
          setOpenedWithoutCard(!isPostOpen && card === null);
        }}
        data-testid="show-embed"
      />
    ) : undefined;

  if (isReading && !isSlow) return <ResourceCardSkeleton withActions />;

  // A video's own embed (a plain frame, not hosted by `PlayerHost`) only while the box is laid out.
  const loadsEmbed = kind !== 'video' || isLaidOut;

  // An embed the platform cannot show closes: the card takes its place, or the pill offers it again.
  const onEmbedError = () => {
    setFailed(true);
    setIsPostOpen(false);
    setOpenedWithoutCard(false);
  };

  // The link to act on (`getResourceTarget`: the link as written, folded), card or not; the card's link
  // and its other spellings read along.
  // The footer is Pinakes' card's, also under a post the app's server read.
  const target = getResourceTarget(pinakesCard, url);
  const actions = (
    <ResourceActions
      uri={target.uri}
      spellings={target.spellings}
      postUri={url}
      collectionsCount={pinakesCard?.collections}
      tagsLabel={getResourceTagsLabel(card)}
      linkUrl={pinakesCard ? getResourceLinks(pinakesCard, url).linkUrl : getHttpUrl(url)}
      title={card?.name}
      card={pinakesCard}
      playOn={showPost}
      extraMenuContent={
        alsoOn
          ? ({ variant, closeMenu }) => <ResourceAlsoOn alsoOn={alsoOn} variant={variant} closeMenu={closeMenu} />
          : undefined
      }
    />
  );

  if (player.embed) {
    return (
      <ResourceEmbedFrame url={url} card={card} actions={actions} headerControl={player.switcher}>
        {player.embed}
      </ResourceEmbedFrame>
    );
  }

  // Something to play shown as its card (its switch's Card, or Card (no player) above its service in
  // Players) is our card too, the switch in its header. With platform embeds up front off the card
  // stays: a video's player (`player.player`), or the post's embed from Show on, loads inside it.
  if (showsCard || (player.isCard && card)) {
    const ownEmbed = !hasCardPlayer && !player.isCard;
    const postVideo = getXPostVideo(card);
    const postEmbed =
      ownEmbed && isPostOpen && !failed ? (
        <Container overrideDefaults className="min-w-0" data-testid="native-embed-body">
          {/* An X post's video the app's server read plays in the app's player, else the site's post shows. */}
          <XPostPlayer
            link={url}
            src={postVideo}
            fallback={() => loadsEmbed && renderEmbed({ onError: onEmbedError, autoplay: true })}
          />
        </Container>
      ) : null;
    const inCard = !embedsUpFront;
    return (
      <ResourceCard
        card={card}
        href={url}
        actions={actions}
        renderBody={ownEmbed && !inCard ? (body: ReactNode) => postEmbed ?? body : undefined}
        isBodyReplaced={!inCard && postEmbed !== null}
        headerControl={player.switcher}
        player={player.player ?? (inCard ? postEmbed : null)}
        // A post shows from the card's data, text and image at once; a video in it keeps its press.
        asPost={!embedsUpFront}
        imageUrl={xPost.imageUrl}
      />
    );
  }

  // No card, with platform embeds up front off: the link's own preview as a card, the platform's Play in
  // its header, the embed loading inside it on the press.
  if (inLinkCard) {
    return (
      <NativeEmbedLinkCard
        link={url}
        kind={kind}
        actions={actions}
        open={openedWithoutCard}
        onOpen={setOpenedWithoutCard}
        renderEmbed={() => loadsEmbed && renderEmbed({ onError: onEmbedError, autoplay: true })}
      />
    );
  }

  return (
    <ResourceEmbedFrame url={url} card={card} actions={actions} fallbackTypeLabel={isVideo ? 'Video' : 'Post'}>
      {/* Nothing in the frame's body until the pill opens the embed. */}
      {!isEmbedOnPress || isPostOpen ? (
        <div ref={embedRef} className="min-w-0" data-testid="native-embed-body">
          {loadsEmbed && renderEmbed({ onError: onEmbedError, autoplay: isEmbedOnPress })}
        </div>
      ) : null}
    </ResourceEmbedFrame>
  );
}

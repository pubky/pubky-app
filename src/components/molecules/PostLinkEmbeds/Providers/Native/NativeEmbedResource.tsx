'use client';

import { type ReactNode, useRef, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { PINAKES_SLOW_READ_MS } from '@/config/pinakes';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { useViewportObserver } from '@/hooks/useViewportObserver/useViewportObserver';
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
} from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceEmbedFrame } from '@/molecules/ResourceCard/ResourceEmbedFrame';
import { useResourceSurface } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import {
  getPlayerTarget,
  getPlayerTargets,
  isCardFirst,
  isPlayable,
} from '@/molecules/ResourcePlayer/resourcePlayer.utils';
import { PlayOnPill } from '@/molecules/ResourcePlayer/ResourcePlayerControls';
import { AnimatedHeight } from '@/molecules/ResourcePlayer/ResourcePlayerFrame';
import { useCardPlayer } from '@/molecules/ResourcePlayer/useCardPlayer';
import { useFramePress } from '@/molecules/ResourcePlayer/useResourcePlayer';
import { ResourceActions } from '@/organisms/ResourceActions/ResourceActions';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { useSlowRead } from '../Generic/useSlowRead';
import type { EmbedResourceKind } from '../Provider.types';
import { chooseNativeEmbed, getNativeEmbedCard, getShowPostLabel } from './nativeEmbed.utils';

/** Renders the platform's own embed; `onError` is called when the platform says it cannot show it. */
export type RenderNativeEmbed = (options: { onError: () => void }) => ReactNode;

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
 * A post's embedded X post, YouTube or Vimeo video as an external resource, embed or card. A video
 * Pinakes has read (`isPlayable`) shows its player up front (`useCardPlayer`'s `embed`) in the
 * resource frame, with the embed/card switch in the frame's header when it is on other services
 * too; or our card with the switch, when Card (no player) ranks above its service; unless the
 * platform's embed was pressed in or opened before the card was read. A video gone upstream that
 * Pinakes knows on such services shows our card, those services in the switch. Anything else (an
 * X post, a video with nothing else to play, no card) follows `chooseNativeEmbed`: the platform's
 * own embed in the resource frame, its only source, so with no switch and no Card, also when
 * Pinakes knows it elsewhere (Also on, in the ⋯ menu). A viewer who turned platform embeds up
 * front off (Settings, Links & Media) gets our card whenever there is one (an X post's from "Show
 * on <site>"), else the frame without the embed until Play on / Show on loads it. The card's
 * skeleton holds the place while Pinakes is read (at most `PINAKES_SLOW_READ_MS`), so no embed
 * loads only to be replaced. Nothing is read before the box first comes near the screen.
 *
 * In the composer, and in the Reply and Repost dialogs (a post being written: `navigable` false),
 * the footer tags the resource before the post is sent, and a player never docks (`preview`).
 */
export function NativeEmbedResource(props: NativeEmbedResourceProps) {
  // The default margin: the box counts as near 200px before it scrolls in.
  const { ref, isVisible } = useViewportObserver();
  const [wasNear, setWasNear] = useState(false);
  if (isVisible && !wasNear) setWasNear(true);
  // The composer's preview is on screen; elsewhere the Pinakes read and the footer's reads wait.
  const choice =
    props.isComposing || wasNear ? (
      <NativeEmbedChoice {...props} isOnScreen={isVisible} />
    ) : (
      <ResourceCardSkeleton withActions />
    );
  return (
    <div ref={ref} className="min-w-0" data-testid="native-embed-resource" data-kind={props.kind}>
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
}: NativeEmbedResourceProps & { isOnScreen: boolean }) {
  const { data, isLoading, isResolving } = usePinakesCard(
    url,
    isComposing ? { resolve: true } : { recheck: isOnScreen },
  );
  // In the composer a link Pinakes did not know is being read (`resolve`): wait for it too, so no
  // platform embed loads only to give way to the card.
  const isReading = isLoading || Boolean(isResolving);
  const isSlow = useSlowRead(url, isReading, PINAKES_SLOW_READ_MS);
  const embedRef = useRef<HTMLDivElement>(null);
  const engaged = useEmbedEngaged(embedRef);
  const [failed, setFailed] = useState(false);
  const [isPostOpen, setIsPostOpen] = useState(false);
  // The embed was opened from the pill before Pinakes knew the link: a card read later keeps it.
  const [openedWithoutCard, setOpenedWithoutCard] = useState(false);
  const embedsUpFront = useSettingsStore((state) => state.media.embedsUpFront);
  const playerOrder = useSettingsStore((state) => state.media.playerOrder);
  const hiddenPlayers = useSettingsStore((state) => state.media.hiddenPlayers);
  const navigable = useIsPostPreviewNavigable();
  // A post being written (the composer, the Reply and Repost dialogs) previews the resource.
  const isPreview = isComposing || !navigable;

  const card = getNativeEmbedCard(data);
  const alsoOn = card ? getMenuAlsoOn(card, url) : null;
  // Card (no player) above the video's service in Players: our card, its player from the switch.
  const videoProvider = kind === 'video' ? getPlayerTarget(url)?.provider : undefined;
  const upFront = embedsUpFront && !(videoProvider !== undefined && isCardFirst(videoProvider, playerOrder));
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
  // Our card for a video the card player cannot play from its own link, or for a post X cannot show:
  // a generic card, its other services (Also on) in the switch.
  const player = useCardPlayer(showsPlayer || (showsCard && (isVideo || failed)) ? card : null, url, actionSurface, {
    preview: isPreview,
  });
  // Without a card, the player's name ("YouTube") as the card gives it, else the host ("x.com").
  const siteName = card ? getResourceLinks(card, url).siteName : (getPlayerTarget(url)?.name ?? getLinkHost(url));

  // An X post on our card: the card player's pill (`PlayOnPill`) shows the post's embed in the body. The
  // same for a video on our card the card player cannot play, and for the frame of a link without a
  // card while embeds load on a press, which offers it again after an embed the platform could not show.
  const showPost =
    (showsCard && !hasCardPlayer && !isComposing && !failed) || isEmbedOnPress ? (
      <PlayOnPill
        uri={url}
        isOpen={isPostOpen}
        label={getShowPostLabel(siteName, isPostOpen, isVideo)}
        aria-expanded={isPostOpen}
        surface={actionSurface}
        onClick={() => {
          setIsPostOpen(!isPostOpen);
          setOpenedWithoutCard(!isPostOpen && card === null);
        }}
        data-testid="show-embed"
      />
    ) : undefined;

  if (isReading && !isSlow) return <ResourceCardSkeleton withActions />;

  // An embed the platform cannot show closes: the card takes its place, or the pill offers it again.
  const onEmbedError = () => {
    setFailed(true);
    setIsPostOpen(false);
    setOpenedWithoutCard(false);
  };

  // The card's canonical link, its other spellings read along (`getResourceTarget`).
  const target = getResourceTarget(card, url);
  const actions = (
    <ResourceActions
      uri={target.uri}
      spellings={target.spellings}
      postUri={url}
      collectionsCount={card?.collections}
      tagsLabel={getResourceTagsLabel(card)}
      linkUrl={card ? getResourceLinks(card, url).linkUrl : getHttpUrl(url)}
      title={card?.name}
      card={card}
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
  // Players) is our card too, the switch in its header.
  if (showsCard || (player.isCard && card)) {
    const renderBody =
      hasCardPlayer || player.isCard
        ? undefined
        : (body: ReactNode) =>
            isPostOpen && !failed ? (
              <Container overrideDefaults className="min-w-0" data-testid="native-embed-body">
                {renderEmbed({ onError: onEmbedError })}
              </Container>
            ) : (
              body
            );
    return (
      <ResourceCard
        card={card}
        href={url}
        actions={actions}
        renderBody={renderBody}
        isBodyReplaced={!hasCardPlayer && isPostOpen && !failed}
        headerControl={player.switcher}
      />
    );
  }

  return (
    <ResourceEmbedFrame url={url} card={card} actions={actions} fallbackTypeLabel={isVideo ? 'Video' : 'Post'}>
      {/* Nothing in the frame's body until the pill opens the embed. */}
      {!isEmbedOnPress || isPostOpen ? (
        <div ref={embedRef} className="min-w-0" data-testid="native-embed-body">
          {renderEmbed({ onError: onEmbedError })}
        </div>
      ) : null}
    </ResourceEmbedFrame>
  );
}

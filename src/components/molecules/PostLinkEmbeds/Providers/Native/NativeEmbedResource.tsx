'use client';

import { type ReactNode, useRef, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { PINAKES_SLOW_READ_MS } from '@/config/pinakes';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { useViewportObserver } from '@/hooks/useViewportObserver/useViewportObserver';
import { ResourceAlsoOn } from '@/molecules/ResourceCard/ResourceAlsoOn';
import { getMenuAlsoOn } from '@/molecules/ResourceCard/ResourceAlsoOn.utils';
import { ResourceCard } from '@/molecules/ResourceCard/ResourceCard';
import {
  getHttpUrl,
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
   * preview and the published post show its card; the same choice, without the footer.
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
 * A post's embedded X post, YouTube or Vimeo video as an external resource. A video Pinakes has read
 * (`isPlayable`) shows its player up front (`useCardPlayer`'s `embed`) in the resource frame, also
 * with Also on, with the switch to its other services and Card in the frame's header; or our card
 * with the switch, when Card (no player) ranks above its service; unless the platform's embed was
 * pressed in before the card was read. Anything else (an X post, a video gone upstream, no card)
 * follows `chooseNativeEmbed`: our card when Pinakes knows it on other services (an X post from
 * "Show on <site>"), else the platform's own embed in the resource frame. A viewer who turned
 * platform embeds up front off (Settings, Links & Media) gets our card whenever there is one,
 * unless it is a video the card player cannot play (then the card would have no Play on). The
 * card's skeleton holds the place while Pinakes is read (at most `PINAKES_SLOW_READ_MS`), so no
 * embed loads only to be replaced. Nothing is read before the box first comes near the screen.
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
  const embedsUpFront = useSettingsStore((state) => state.media.embedsUpFront);
  const playerOrder = useSettingsStore((state) => state.media.playerOrder);

  const card = getNativeEmbedCard(data);
  const alsoOn = card ? getMenuAlsoOn(card, url) : null;
  // Card (no player) above the video's service in Players: our card, its player on Play on.
  const videoProvider = kind === 'video' ? getPlayerTarget(url)?.provider : undefined;
  const cardFirst = videoProvider !== undefined && isCardFirst(videoProvider, playerOrder);
  // A video the card player has no player for (an `http:` link, one gone upstream) keeps its embed.
  const upFront =
    (embedsUpFront && !cardFirst) || (kind === 'video' && !(card && getPlayerTargets(card, { href: url }).length > 0));
  const choice = chooseNativeEmbed({
    hasCard: card !== null,
    hasAlsoOn: alsoOn !== null,
    embedFailed: failed,
    engaged,
    upFront,
  });
  const showsCard = choice === 'card' && card !== null;
  const isVideo = kind === 'video';
  // A video Pinakes has read shows its player up front (`embed`), also in the composer, unless the
  // platform's embed was already pressed in. An X post keeps X's embed.
  const showsPlayer = isVideo && card !== null && isPlayable(card, url) && !engaged;
  // On a top-level card (a collection's) the player's pills sit on the card's surface, as in `ResourceActions`.
  const actionSurface = useResourceSurface() === 'card' ? 'default' : undefined;
  const player = useCardPlayer(
    showsPlayer || (showsCard && isVideo && !isComposing) ? card : null,
    url,
    actionSurface,
    {
      preview: isComposing,
    },
  );
  const siteName = card ? getResourceLinks(card, url).siteName : null;

  // An X post on our card: the card player's pill (`PlayOnPill`) shows the post's embed in the body.
  const showPost =
    showsCard && !isVideo && !failed && !isComposing ? (
      <PlayOnPill
        uri={url}
        isOpen={isPostOpen}
        label={getShowPostLabel(siteName, isPostOpen)}
        aria-expanded={isPostOpen}
        onClick={() => setIsPostOpen((open) => !open)}
        data-testid="show-embed"
      />
    ) : undefined;

  if (isReading && !isSlow) return <ResourceCardSkeleton withActions={!isComposing} />;

  // The card's canonical link, its other spellings read along (`getResourceTarget`).
  const target = getResourceTarget(card, url);
  const actions = isComposing ? null : (
    <ResourceActions
      uri={target.uri}
      spellings={target.spellings}
      postUri={url}
      collectionsCount={card?.collections}
      tagsLabel={getResourceTagsLabel(card)}
      linkUrl={card ? getResourceLinks(card, url).linkUrl : getHttpUrl(url)}
      title={card?.name}
      card={card}
      playOn={showsCard ? (isVideo ? player.playOn : showPost) : undefined}
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
      isVideo || player.isCard
        ? player.renderBody
        : (body: ReactNode) =>
            isPostOpen && !failed ? (
              <Container overrideDefaults className="min-w-0" data-testid="native-embed-body">
                {renderEmbed({ onError: () => setFailed(true) })}
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
        isBodyReplaced={isVideo ? player.isOpen : isPostOpen && !failed}
        headerControl={player.switcher}
      />
    );
  }

  return (
    <ResourceEmbedFrame url={url} card={card} actions={actions} fallbackTypeLabel={isVideo ? 'Video' : 'Post'}>
      <div ref={embedRef} className="min-w-0" data-testid="native-embed-body">
        {renderEmbed({ onError: () => setFailed(true) })}
      </div>
    </ResourceEmbedFrame>
  );
}

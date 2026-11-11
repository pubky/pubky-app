'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { pauseMedia, tellsWhenPlaying } from '@/libs/utils/mediaPlayback';
import { getResourceStatus, getResourceTarget, playsInCard } from '@/molecules/ResourceCard/ResourceCard.utils';
import { getResourceSummary } from '@/molecules/ResourceCard/ResourceFacts.utils';
import type { PostActionSurface } from '@/organisms/PostActionsBar/PostActionButton';
import { PinakesStatus, type TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { usePlayerHost } from './PlayerHost';
import {
  CARD_PLAYER,
  type EmbedProvider,
  getCategoryPlayers,
  getOwnPlayer,
  getPlayerCategory,
  getPlayerTargets,
  getUpFrontTarget,
  isCardFirstFor,
  type PlayerTarget,
} from './resourcePlayer.utils';
import { type PagePlayer, PlayerDock, PlayerSwitch, PlayStandIn } from './ResourcePlayerControls';
import { ResourcePlayerFrame } from './ResourcePlayerFrame';
import { type ResourcePlayerState, useResourcePlayer } from './useResourcePlayer';

export interface CardPlayer {
  /**
   * The chosen service's player, shown where the card's image and text would be (`EmbedPlayer`).
   * Absent while the card shows, and for a card on no service with a player.
   */
  embed?: ReactNode;
  /**
   * The embed/card switch (`PlayerSwitch`: Card, then the card's services), for the header of the
   * frame or card it is shown in; only with a choice to make (more than one service, a generic link,
   * Card shown, or Card (no player) above the service in Players).
   */
  switcher?: ReactNode;
  /**
   * A card on a service with a player shown as its card (a generic link up front, its switch's Card,
   * or Card (no player) above its first service in Players): no service's embed loads.
   */
  isCard?: boolean;
}

export interface CardPlayerOptions {
  /**
   * A preview (the composer): the player takes the page when it plays but never docks; with
   * platform embeds up front off, its button shows the player paused.
   */
  preview?: boolean;
}

/**
 * Embed or card: the services' own players for a card, wherever a card renders (a post's embed,
 * the composer, Edit Post, Repost, a collection, the resource page). Every card on
 * a service with a player (`getPlayerTargets`: its own link, its Also on) follows one rule, with
 * one switch in its header whenever there is a choice (`switcher`: Card, then the services) and
 * no Play on in its action row:
 * - A link that is itself on a service with a player (`getOwnPlayer`: a Spotify artist page, a
 *   YouTube video, a SoundCloud track) shows that service's player up front (`embed`), in place of
 *   the card's image and text.
 * - A generic link (MusicBrainz, Wikipedia, Discogs, an article) shows our card up front (`isCard`),
 *   the services Pinakes knows it on (Also on) in the switch below Card.
 * - One service only, the link's own: its player alone, no switch and no Card, unless Card (no
 *   player) is above that service in Players: then the switch offers Card and that service. A
 *   viewer who wants cards turns "Show platform embeds up front" off (Settings, Links & Media).
 * - Several services: the link's own first, then the others; Card is always in the switch.
 * - The viewer's Players (Settings, Links & Media) still apply, those of the card's kind
 *   (`getPlayerCategory`: Music, Podcasts, Video): services in the viewer's order go first (no order
 *   set: the link's own first, then Pinakes' order), removed ones are left out (a link whose own
 *   service is removed counts as generic), and Card (no player) above a link's first service shows
 *   the card. The default is no order.
 * - A podcast that plays in its card (an episode's audio, a show's latest episodes: `playsInCard`)
 *   shows the card first, with the app's own player: Podcasts' Card is their built-in player, first
 *   until the viewer moves it below a service. For a podcast with nothing to play there, the
 *   built-in player's place counts for nothing (`isCardFirstFor`); the rules above stand.
 *
 * A pick switches in place, paused; what played stops. A player plays only on a press inside it
 * (never on mount or scroll); once it plays it is the page's one player and docks at the bottom of
 * the screen when its card scrolls away (`PlayerDock`). With platform embeds up front off, a
 * stand-in loads nothing from the services until its Play is pressed.
 *
 * @param card - The card shown, or `null` (nothing to play: a link's own preview, a pending card)
 * @param href - The link as written, played first when it is on such a service
 * @param surface - What the action row sits on (`ResourceActions`' `surface`): `default` on the resource page
 */
export function useCardPlayer(
  card: TPinakesResourceDetail | null,
  href?: string | null,
  surface?: PostActionSurface,
  { preview = false }: CardPlayerOptions = {},
): CardPlayer {
  // The card's place on the page and the resource in it: another resource in the same place is
  // another player, so it never inherits the page's player (`useResourcePlayer` lets the old one go).
  const place = useId();
  const owner = `${place}|${card?.uri ?? ''}`;
  const media = useSettingsStore((state) => state.media);
  const { embedsUpFront } = media;
  // What the viewer picked in the switch, a service or Card, for this resource only.
  const [picked, setPicked] = useState<{ uri: string; choice: EmbedChoice } | null>(null);
  // The resource whose Play was pressed with platform embeds up front off: its player shows.
  const [optedIn, setOptedIn] = useState<string | null>(null);
  // The Players of the card's kind: by its type, else by the service it plays on first.
  const category = getPlayerCategory(card, card ? getPlayerTargets(card, { href })[0]?.provider : undefined);
  const players = getCategoryPlayers(media, category);
  const targets = card ? getPlayerTargets(card, { href, players }) : [];
  // The link is itself on a service with a player, not gone upstream nor removed from Players: that
  // player goes first. Else the link is generic here: its card goes first.
  const ownTarget = card && getResourceStatus(card.status) !== PinakesStatus.MISSING ? getOwnPlayer(card, href) : null;
  // A document frame (slides, an oEmbed) with platform embeds up front off: its card, the frame in the switch.
  const own = ownTarget?.frame === 'rich' && !embedsUpFront ? null : ownTarget;
  const linked = own !== null && targets.some((target) => target.provider === own.provider);
  // The app's player host keeps the frame of any player but a preview's: it plays on across pages.
  const hosted = usePlayerHost() !== null && !preview;
  const player = useResourcePlayer(owner, targets, { hosted });
  if (!card || targets.length === 0) return {};
  const pagePlayer = hosted ? { owner, resource: getResourceTarget(card, href ?? card.uri).uri } : undefined;

  const title = card.name?.trim() || href || card.uri;
  // Another resource starts over: nothing picked; a generic link's card, else the Players order
  // again (its first service, or the card when Card (no player) is above that service).
  const cardFirst = !linked || isCardFirstFor(category, targets[0].provider, players.playerOrder, playsInCard(card));
  const choice = (picked?.uri === card.uri ? picked.choice : null) ?? (cardFirst ? CARD_PLAYER : null);
  const selected = choice === CARD_PLAYER ? null : (targets.find((target) => target.provider === choice) ?? targets[0]);
  const showsPlayer = embedsUpFront || optedIn === card.uri;
  const choose = (next: EmbedChoice) => {
    // Switching is no Close: what played stops, the next service shows paused. The card lets go
    // of a Play on pressed with platform embeds up front off, so nothing loads before the next.
    if (player.current) player.close();
    if (next === CARD_PLAYER) setOptedIn(null);
    setPicked({ uri: card.uri, choice: next });
  };
  // A choice to make: several services, or Card when it comes first (a generic link, or Card above
  // the service in Players) or is shown. The link's own service alone, with no Card above it, has
  // none: a viewer who wants cards turns platform embeds up front off.
  const switcher =
    targets.length > 1 || cardFirst || !selected ? (
      <PlayerSwitch
        targets={targets}
        current={selected}
        onSelect={(target) => {
          if (target.provider !== selected?.provider) choose(target.provider);
        }}
        onShowCard={() => {
          if (selected) choose(CARD_PLAYER);
        }}
        icons={showsPlayer}
        surface={surface}
      />
    ) : undefined;
  if (!selected) return { isCard: true, switcher };
  return {
    switcher,
    embed: (
      // A new resource or service starts over: no Play on pressed. The same one (new counts or
      // tags) keeps its player.
      <EmbedPlayer
        key={`${card.uri}|${selected.provider}`}
        card={card}
        title={title}
        target={selected}
        player={player}
        surface={surface}
        preview={preview}
        pagePlayer={pagePlayer}
        showsPlayer={showsPlayer}
        onOptIn={(on) => setOptedIn(on ? card.uri : null)}
      />
    ),
  };
}

/** What a card's switch picks: a service, or its card. */
type EmbedChoice = EmbedProvider | typeof CARD_PLAYER;

interface EmbedPlayerProps {
  card: TPinakesResourceDetail;
  title: string;
  /** The service shown (the switch's pick, else the first in Players order). */
  target: PlayerTarget;
  player: ResourcePlayerState;
  surface?: PostActionSurface;
  preview: boolean;
  /** The page's player it is, kept by the app's player host (`PlayerDock`); not in a preview. */
  pagePlayer?: PagePlayer;
  /** Platform embeds up front, or Play on pressed here with them off: the player shows. */
  showsPlayer: boolean;
  /** Play on pressed with platform embeds up front off (`true`), or the player let go (`false`). */
  onOptIn: (on: boolean) => void;
}

/**
 * A card's player, up front or picked in its switch: its service's embed, paused (`getUpFrontTarget`).
 * Its playing makes it the page's player, which then docks (never in a preview) until other media
 * starts or Close. With platform embeds up front off, a stand-in with Play on loads nothing from
 * the services.
 */
function EmbedPlayer({
  card,
  title,
  target,
  player,
  surface = 'muted',
  preview,
  pagePlayer,
  showsPlayer,
  onOptIn,
}: EmbedPlayerProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  // The player was opened by the stand-in's Play: it starts on load.
  const [autoStart, setAutoStart] = useState(false);
  // A new frame for the same service: what played in the old one stops.
  const [round, setRound] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  // Says when it plays, and pauses where it is: an audio file and the players that tell
  // (`tellsWhenPlaying`); any other starts by a press inside it (`ResourcePlayerFrame`).
  const tells = target.element === 'audio' || tellsWhenPlaying(target.src);
  const isActive = player.current !== null;
  // Other media started (it paused this one), or the dock closed this one: a player that pauses
  // stays as it is; any other is loaded anew, paused.
  const [wasActive, setWasActive] = useState(isActive);
  if (wasActive !== isActive) {
    setWasActive(isActive);
    if (!isActive) {
      if (!tells) setRound((value) => value + 1);
      setAutoStart(false);
    }
  }
  // With platform embeds up front off, the stand-in comes back once the player is let go.
  const wasPlaying = useRef(isActive);
  useEffect(() => {
    if (wasPlaying.current && !isActive) onOptIn(false);
    wasPlaying.current = isActive;
  }, [isActive, onOptIn]);

  // A post, map or document frame stays in its card, not in the player host: hidden with the card
  // (a feed behind an open post), it is let go until the card shows again, as the host's frames are.
  const [isHidden, setIsHidden] = useState(false);
  const framed = Boolean(target.frame) && showsPlayer;
  useEffect(() => {
    const box = boxRef.current;
    if (!framed || !box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setIsHidden(box.getClientRects().length === 0));
    observer.observe(box);
    return () => observer.disconnect();
  }, [framed]);

  const frameKey = `${target.provider}:${round}`;
  // Platform embeds turned off while this player was the page's: its frame is gone, so is its claim.
  useEffect(() => {
    if (!showsPlayer && isActive) player.close();
  }, [showsPlayer, isActive, player]);

  // Under the app's player host the frame is not in this box: the host's dock pauses it.
  const close = () => {
    if (boxRef.current) pauseMedia(boxRef.current);
    player.close();
  };

  const open = () => {
    onOptIn(true);
    // A post, map or document frame is shown, not played: what plays keeps playing.
    if (preview || target.frame) return;
    setAutoStart(true);
    player.play(target);
  };

  if (!showsPlayer) {
    // A post, map or document frame is shown, not played.
    const label = target.frame
      ? `Show on ${target.name}`
      : preview
        ? `Show the ${target.name} player`
        : `Play on ${target.name}`;
    return (
      <PlayStandIn
        data-resource-controls
        data-testid="embed-player"
        label={label}
        title={title}
        detail={getResourceSummary(card)}
        onPlay={open}
        surface={surface}
      />
    );
  }

  return (
    <div ref={boxRef} data-resource-controls data-testid="embed-player" className="min-w-0">
      <PlayerDock
        target={target}
        title={title}
        onClose={close}
        dockable={isActive && !player.paused && !preview && !target.frame}
        pagePlayer={target.frame ? undefined : pagePlayer}
      >
        {!(framed && isHidden) && (
          <ResourcePlayerFrame
            key={frameKey}
            target={autoStart ? target : getUpFrontTarget(target)}
            title={title}
            // Opened by Play on, it is the page's player (`player.current`): its load state, with the
            // service's page when it has not answered. Up front, quiet, it only hides its placeholder.
            load={autoStart && isActive ? player.load : loadedKey === frameKey ? 'ready' : 'loading'}
            onLoaded={autoStart && isActive ? player.onLoaded : () => setLoadedKey(frameKey)}
            quiet={!autoStart}
            onPlay={target.frame ? undefined : (media) => player.play(target, media)}
            // Paused or ended in its card, it does not go to the dock.
            onPause={player.pause}
          />
        )}
      </PlayerDock>
    </div>
  );
}

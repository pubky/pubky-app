'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { pauseMedia, tellsWhenPlaying } from '@/libs/utils/mediaPlayback';
import { getResourceStatus, playsInCard } from '@/molecules/ResourceCard/ResourceCard.utils';
import { hasPostVideo, showsPostFromCard } from '@/molecules/ResourceCard/ResourcePost';
import { isLocationRow } from '@/molecules/ResourceMap/ResourceLocation';
import { useResourceLocationVariant } from '@/molecules/ResourceMap/ResourceLocationContext';
import { getMapsDestination } from '@/molecules/ResourceMap/ResourceMap.utils';
import type { PostActionSurface } from '@/organisms/PostActionsBar/PostActionButton';
import { PinakesStatus, type TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { usePlayerHost, usePlaysElsewhere } from './PlayerHost';
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
import { type PagePlayer, PlayerDock, PlayerSwitch } from './ResourcePlayerControls';
import { ResourcePlayerFacade } from './ResourcePlayerFacade';
import { ResourcePlayerFrame } from './ResourcePlayerFrame';
import { type ResourcePlayerState, useResourcePlayer } from './useResourcePlayer';

export interface CardPlayer {
  /**
   * The chosen service's player, shown where the card's image and text would be: up front its embed
   * (`EmbedPlayer`); with platform embeds up front off the app's drawing of it (`ResourcePlayerFacade`)
   * until the viewer's press on it or pick in the switch, then its embed. Absent while the card shows
   * and for a card on no service with a player.
   */
  embed?: ReactNode;
  /**
   * For the header of the frame or card it is shown in: the embed/card switch (`PlayerSwitch`: Card,
   * then the card's services), only with a choice to make (more than one service, a generic link,
   * Card shown, or Card (no player) above the service in Players). Never a Play of its own.
   */
  switcher?: ReactNode;
  /**
   * The card shows (a generic link, its switch's Card, Card (no player) above its first service in
   * Players): no service's player in its place.
   */
  isCard?: boolean;
  /** A service's player (or, with platform embeds up front off, its drawing) shows in the card's place. */
  showsPlayer?: boolean;
}

export interface CardPlayerOptions {
  /**
   * A preview (the composer): the player takes the page when it plays but never docks; with
   * platform embeds up front off, its button shows the player paused.
   */
  preview?: boolean;
  /**
   * The card's link preview image when it has none of its own (`usePostPreviewImage`): with it the post
   * rules (`showsPostFromCard`, `hasPostVideo`) see an X video still too, as the card's surfaces do.
   */
  previewImage?: string | null;
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
 * the screen when its card scrolls away (`PlayerDock`).
 *
 * With platform embeds up front off (the default) the view is the same, and nothing loads from the
 * services before the viewer's press: where a service's player would show up front, the app draws it
 * from the card's data (`ResourcePlayerFacade`: its place and height, cover, title, summary and the
 * service's mark), one button. A press on it (or Enter) loads that service's player in its place,
 * started where the service allows, as the page's player. A pick in the switch is the press: the
 * picked service's player loads at once and starts; Card shows the card and unloads it. Let go (other
 * media started, the dock closed it), the player gives way to its drawing again. A post the card tells
 * from its own data and a map the card draws are no choice then; a post, map or document frame that is
 * the link's own shows the card first, the frame in the switch.
 *
 * @param card - The card shown, or `null` (nothing to play: a link's own preview, a pending card)
 * @param href - The link as written, played first when it is on such a service
 * @param surface - What the action row sits on (`ResourceActions`' `surface`): `default` on the resource page
 */
export function useCardPlayer(
  card: TPinakesResourceDetail | null,
  href?: string | null,
  surface?: PostActionSurface,
  { preview = false, previewImage = null }: CardPlayerOptions = {},
): CardPlayer {
  // The card's place on the page and the resource in it: another resource in the same place is
  // another player, so it never inherits the page's player (`useResourcePlayer` lets the old one go).
  const place = useId();
  const owner = `${place}|${card?.uri ?? ''}`;
  const media = useSettingsStore((state) => state.media);
  const { embedsUpFront } = media;
  // What the viewer picked in the switch, a service or Card, for this resource only.
  const [picked, setPicked] = useState<{ uri: string; choice: EmbedChoice } | null>(null);
  // With platform embeds up front off, the resource whose player the viewer loaded (a press on its
  // drawing, a pick in the switch): its embed shows instead of the drawing.
  const [optedIn, setOptedIn] = useState<string | null>(null);
  // Set by a press on the drawing: the player that press loads takes the focus, once (`takeFocus`).
  const pressed = useRef(false);
  const takeFocus = () => {
    const was = pressed.current;
    pressed.current = false;
    return was;
  };
  // The Players of the card's kind: by its type, else by the service it plays on first.
  const category = getPlayerCategory(card, card ? getPlayerTargets(card, { href })[0]?.provider : undefined);
  const players = getCategoryPlayers(media, category);
  // With platform embeds up front off, a post the card tells from its own data (`showsPostFromCard`)
  // shows as a post in the card: its site's post frame is no choice then.
  // A place or event whose card draws its own map (`ResourceLocation`): a map service's embed would be a
  // second map under it, so it is no choice; one with no map drawn (no point, a row) keeps it.
  const locationVariant = useResourceLocationVariant();
  const destination = card ? getMapsDestination(card) : null;
  // With platform embeds up front on the map service's embed stays a choice, as before.
  const drawsOwnMap = !embedsUpFront && destination !== null && !isLocationRow(destination, locationVariant);
  const targets = card
    ? getPlayerTargets(card, { href, players }).filter(
        (target) =>
          (embedsUpFront || target.frame !== 'post' || !showsPostFromCard(card, previewImage)) &&
          !(drawsOwnMap && target.frame === 'map'),
      )
    : [];
  // The link is itself on a service with a player, not gone upstream nor removed from Players: that
  // player goes first. Else the link is generic here: its card goes first.
  const ownTarget = card && getResourceStatus(card.status) !== PinakesStatus.MISSING ? getOwnPlayer(card, href) : null;
  // A post, map or document frame with platform embeds up front off: its card, the frame in the switch.
  const own = ownTarget?.frame && !embedsUpFront ? null : ownTarget;
  const linked = own !== null && targets.some((target) => target.provider === own.provider);
  // The app's player host keeps the frame of any player but a preview's: it plays on across pages.
  const hosted = usePlayerHost() !== null && !preview;
  const player = useResourcePlayer(owner, targets, { hosted });
  // Platform embeds turned off while a player up front plays: its frame is gone, so is its claim.
  const isLetGo = !embedsUpFront && optedIn !== card?.uri && player.current !== null;
  useEffect(() => {
    if (isLetGo) player.close();
  }, [isLetGo, player]);
  if (!card || targets.length === 0) return {};
  const pagePlayer = hosted ? { owner, resource: card.uri } : undefined;

  const title = card.name?.trim() || href || card.uri;
  // Another resource starts over: nothing picked; a generic link's card, else the Players order
  // again (its first service, or the card when Card (no player) is above that service).
  const builtIn = playsInCard(card);
  const cardFirst = !linked || isCardFirstFor(category, targets[0].provider, players.playerOrder, builtIn);
  const choice = (picked?.uri === card.uri ? picked.choice : null) ?? (cardFirst ? CARD_PLAYER : null);
  const selected = choice === CARD_PLAYER ? null : (targets.find((target) => target.provider === choice) ?? targets[0]);
  // Loads the service's player in the drawing's place (platform embeds up front off): it starts as the
  // page's player; a post, map or document frame is shown, not played; a preview shows it paused.
  const open = (target: PlayerTarget) => {
    // A press on the drawing moves the focus into the player that replaces it (`takeFocus`).
    pressed.current = true;
    setOptedIn(card.uri);
    if (!preview && !target.frame) player.play(target);
  };
  const choose = (next: EmbedChoice) => {
    // Switching is no Close: what played stops. Up front the next service shows paused; with platform
    // embeds up front off the pick is the viewer's press: the next service loads at once, Card unloads.
    if (player.current) player.close();
    setOptedIn(null);
    setPicked({ uri: card.uri, choice: next });
    const target = next === CARD_PLAYER ? undefined : targets.find((each) => each.provider === next);
    if (!embedsUpFront && target) open(target);
  };
  // A choice to make: several services, or Card when it comes first (a generic link, or Card above
  // the service in Players) or is shown. The link's own service alone, with no Card above it, has
  // none.
  const switcher =
    targets.length > 1 || cardFirst || !selected ? (
      <PlayerSwitch
        targets={targets}
        current={selected}
        onSelect={(target) => {
          if (target.provider !== selected?.provider) choose(target.provider);
          // The service drawn, picked again: the pick is the press that loads it.
          else if (!embedsUpFront && optedIn !== card.uri) open(target);
        }}
        onShowCard={() => {
          if (selected) choose(CARD_PLAYER);
        }}
        icons
        surface={surface}
      />
    ) : undefined;
  if (!selected) return { isCard: true, switcher };
  if (!embedsUpFront) {
    const holdsVideo = selected.frame === 'post' && hasPostVideo(card, previewImage);
    const isOpen = optedIn === card.uri;
    const embedPlayer = (slotOnly: boolean) => (
      <EmbedPlayer
        key={`${card.uri}|${selected.provider}`}
        title={title}
        target={selected}
        player={player}
        preview={preview}
        pagePlayer={pagePlayer}
        startsOnLoad={!preview && !selected.frame}
        holdsVideo={holdsVideo}
        onLetGo={() => setOptedIn(null)}
        slotOnly={slotOnly}
        takeFocus={takeFocus}
      />
    );
    const facade = (
      <ResourcePlayerFacade
        key={`${card.uri}|${selected.provider}`}
        card={card}
        target={selected}
        title={title}
        preview={preview}
        onPlay={() => open(selected)}
      />
    );
    return {
      switcher,
      showsPlayer: true,
      embed: isOpen ? (
        embedPlayer(false)
      ) : pagePlayer ? (
        <DrawnOrPlaying
          key={`${card.uri}|${selected.provider}`}
          match={`${pagePlayer.resource}|${selected.provider}`}
          owner={owner}
          playing={() => embedPlayer(true)}
        >
          {facade}
        </DrawnOrPlaying>
      ) : (
        facade
      ),
    };
  }
  return {
    switcher,
    showsPlayer: true,
    embed: (
      // A new resource or service starts over. The same one (new counts or tags) keeps its player.
      <EmbedPlayer
        key={`${card.uri}|${selected.provider}`}
        title={title}
        target={selected}
        player={player}
        preview={preview}
        pagePlayer={pagePlayer}
      />
    ),
  };
}

/** What a card's switch picks: a service, or its card. */
type EmbedChoice = EmbedProvider | typeof CARD_PLAYER;

interface EmbedPlayerProps {
  title: string;
  /** The service shown (the switch's pick, else the first in Players order). */
  target: PlayerTarget;
  player: ResourcePlayerState;
  preview: boolean;
  /** The page's player it is, kept by the app's player host (`PlayerDock`); not in a preview. */
  pagePlayer?: PagePlayer;
  /** Loaded by the viewer's press on its drawing or pick (platform embeds up front off): it starts on load. */
  startsOnLoad?: boolean;
  /** The player was let go (other media started, the dock closed it): its drawing comes back. */
  onLetGo?: () => void;
  /** A post frame that holds a video: a press inside it is a start (`ResourcePlayerFrame`'s `holdsVideo`). */
  holdsVideo?: boolean;
  /**
   * Platform embeds up front off, the same resource playing from another card (`usePlaysElsewhere`):
   * only its slot, which the app's player host lays the playing frame over; no frame of its own.
   */
  slotOnly?: boolean;
  /** Called once the frame mounts: `true` when it is to take the focus (`ResourcePlayerFrame`'s `takeFocus`). */
  takeFocus?: () => boolean;
}

/**
 * With platform embeds up front off, a card's player as the app draws it (`children`), or, while the
 * same resource on the same service plays from another card (a song played in the feed, its post
 * opened), the slot the app's player host lays that playing frame over (`playing`), as up front.
 */
function DrawnOrPlaying({
  match,
  owner,
  playing,
  children,
}: {
  match: string;
  owner: string;
  playing: () => ReactNode;
  children: ReactNode;
}) {
  return usePlaysElsewhere(match, owner) ? playing() : children;
}

/**
 * A card's player: up front or picked in its switch, its service's embed, paused (`getUpFrontTarget`);
 * loaded by a press on its drawing or a pick (platform embeds up front off), started on load. Its playing makes it the
 * page's player, which then docks (never in a preview) until other media starts or Close.
 */
function EmbedPlayer({
  title,
  target,
  player,
  preview,
  pagePlayer,
  startsOnLoad = false,
  onLetGo,
  holdsVideo = false,
  slotOnly = false,
  takeFocus,
}: EmbedPlayerProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  // The player was loaded by the viewer's press: it starts on load.
  const [autoStart, setAutoStart] = useState(startsOnLoad);
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
  // With platform embeds up front off, its drawing comes back once the player is let go.
  const wasPlaying = useRef(isActive);
  useEffect(() => {
    if (wasPlaying.current && !isActive) onLetGo?.();
    wasPlaying.current = isActive;
  }, [isActive, onLetGo]);

  // A post, map or document frame stays in its card, not in the player host: hidden with the card
  // (a feed behind an open post), it is let go until the card shows again, as the host's frames are.
  const [isHidden, setIsHidden] = useState(false);
  const framed = Boolean(target.frame);
  useEffect(() => {
    const box = boxRef.current;
    if (!framed || !box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setIsHidden(box.getClientRects().length === 0));
    observer.observe(box);
    return () => observer.disconnect();
  }, [framed]);

  const frameKey = `${target.provider}:${round}`;

  // Under the app's player host the frame is not in this box: the host's dock pauses it.
  const close = () => {
    if (boxRef.current) pauseMedia(boxRef.current);
    player.close();
  };

  return (
    <div ref={boxRef} data-resource-controls data-testid="embed-player" className="min-w-0">
      <PlayerDock
        target={target}
        title={title}
        onClose={close}
        dockable={isActive && !player.paused && !preview && !target.frame}
        pagePlayer={target.frame ? undefined : pagePlayer}
      >
        {!slotOnly && !(framed && isHidden) && (
          <ResourcePlayerFrame
            key={frameKey}
            target={autoStart ? target : getUpFrontTarget(target)}
            title={title}
            // Loaded by the viewer's press, it is the page's player (`player.current`): its load state, with the
            // service's page when it has not answered. Up front, quiet, it only hides its placeholder.
            load={autoStart && isActive ? player.load : loadedKey === frameKey ? 'ready' : 'loading'}
            onLoaded={autoStart && isActive ? player.onLoaded : () => setLoadedKey(frameKey)}
            quiet={!autoStart}
            onPlay={target.frame ? undefined : (media) => player.play(target, media)}
            // Paused or ended in its card, it does not go to the dock.
            onPause={player.pause}
            holdsVideo={holdsVideo}
            takeFocus={takeFocus}
          />
        )}
      </PlayerDock>
    </div>
  );
}

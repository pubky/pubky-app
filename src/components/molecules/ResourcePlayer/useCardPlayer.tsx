'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { pauseMedia, tellsWhenPlaying } from '@/libs/utils/mediaPlayback';
import { getResourceStatus } from '@/molecules/ResourceCard/ResourceCard.utils';
import { getResourceSummary } from '@/molecules/ResourceCard/ResourceFacts.utils';
import type { PostActionSurface } from '@/organisms/PostActionsBar/PostActionButton';
import { postActionsButtonVariants } from '@/organisms/PostActionsBar/PostActionsBar.variants';
import { PinakesStatus, type TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import {
  CARD_PLAYER,
  getPlayerTargets,
  getUpFrontTarget,
  isCardFirst,
  isPlayable,
  type PlayerProvider,
  type PlayerTarget,
} from './resourcePlayer.utils';
import { PlayerDock, PlayerSwitch, PlayOnSplit } from './ResourcePlayerControls';
import { AnimatedHeight, ResourcePlayerFrame } from './ResourcePlayerFrame';
import { type ResourcePlayerState, useResourcePlayer } from './useResourcePlayer';

export interface CardPlayer {
  /** "Play on <service>" for the card's action row (`ResourceActions`'s `playOn`); absent with no player. */
  playOn?: ReactNode;
  /** Puts the open player in place of the card's image and text (`ResourceCard`'s `renderBody`). */
  renderBody?: (body: ReactNode) => ReactNode;
  /** Whether the player is open, in the card or its dock (`ResourceCard`'s `isBodyReplaced`). */
  isOpen?: boolean;
  /**
   * A playable card's player (`isPlayable`), shown up front where the card's image and text would
   * be (`EmbedPlayer`); the card then has no Play on. Absent for anything else.
   */
  embed?: ReactNode;
  /**
   * The switch to the playable card's other services and Card (`PlayerSwitch`), for the header of
   * the frame or card it is shown in; only with a choice to make (more than one service, or Card
   * shown).
   */
  switcher?: ReactNode;
  /**
   * A playable card shown as its card instead (its switch's Card, or Card (no player) above its
   * first service in Players): no service's embed loads, up front or otherwise.
   */
  isCard?: boolean;
}

export interface CardPlayerOptions {
  /**
   * A preview (the composer): only a playable card's player; it takes the page when it plays but
   * never docks; with platform embeds up front off, its button shows the player paused.
   */
  preview?: boolean;
}

/**
 * The services' own players for a card, wherever a card with an action row renders (a post's
 * embed, the resource page).
 *
 * A card that is something to play (`isPlayable`: a video, a song, an album, an episode, or any
 * link on a service with a player) shows its service's player up front (`embed`, `EmbedPlayer`), in
 * place of the card's image and text: the viewer's first service in Players the card is on, else
 * the shared link's, else the first in Pinakes' order (`getPlayerTargets`). The switch
 * (`switcher`, for the header) picks another of its services or Card. Card, or Card (no player)
 * above its first service in Players, shows the card instead (`isCard`).
 *
 * Any other card on such a service (an artist, say) keeps "Play on <service>" in its action row
 * (`playOn`), which plays the first service that allows embedding, its chevron another; the player
 * takes the place of the card's image and text and the same pill closes it. A player whose card
 * scrolls away keeps playing in a dock at the bottom of the screen (`PlayerDock`). One player plays
 * on the whole page. A card on no such service gets neither. The viewer's Players (Settings, Links
 * & Media) order the services and leave out removed ones.
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
  const playerOrder = useSettingsStore((state) => state.media.playerOrder);
  const hiddenPlayers = useSettingsStore((state) => state.media.hiddenPlayers);
  const embedsUpFront = useSettingsStore((state) => state.media.embedsUpFront);
  // What the viewer picked in the switch, a service or Card, for this resource only.
  const [picked, setPicked] = useState<{ uri: string; choice: EmbedChoice } | null>(null);
  // The resource whose Play on was pressed with platform embeds up front off: its player shows.
  const [optedIn, setOptedIn] = useState<string | null>(null);
  const playable = card !== null && getResourceStatus(card.status) === PinakesStatus.OK && isPlayable(card, href);
  // A player shown up front starts on no press of ours: its services stay in Pinakes' order.
  const targets = card
    ? getPlayerTargets(card, { href, players: { playerOrder, hiddenPlayers }, autoplayFirst: !playable })
    : [];
  const player = useResourcePlayer(owner, targets);
  if (!card || targets.length === 0) return {};

  const title = card.name?.trim() || href || card.uri;
  if (playable) {
    // Another resource starts over: nothing picked, the Players order again (its first service, or
    // the card when Card (no player) is above that service).
    const choice =
      (picked?.uri === card.uri ? picked.choice : null) ??
      (isCardFirst(targets[0].provider, playerOrder) ? CARD_PLAYER : null);
    const selected =
      choice === CARD_PLAYER ? null : (targets.find((target) => target.provider === choice) ?? targets[0]);
    const showsPlayer = embedsUpFront || optedIn === card.uri;
    const choose = (next: EmbedChoice) => {
      // Switching is no Close: what played stops, the next service shows paused. The card lets go
      // of a Play on pressed with platform embeds up front off, so nothing loads before the next.
      if (player.current) player.close();
      if (next === CARD_PLAYER) setOptedIn(null);
      setPicked({ uri: card.uri, choice: next });
    };
    const switcher =
      targets.length > 1 || !selected ? (
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
          showsPlayer={showsPlayer}
          onOptIn={(on) => setOptedIn(on ? card.uri : null)}
        />
      ),
    };
  }
  if (preview) return {};

  const current = player.current;
  return {
    playOn: <PlayOnSplit targets={targets} player={player} surface={surface} />,
    isOpen: current !== null,
    renderBody: (body) => (
      <AnimatedHeight>
        {current ? (
          <PlayerDock target={current} title={title} onClose={player.close}>
            <ResourcePlayerFrame
              key={current.provider}
              target={current}
              title={title}
              load={player.load}
              onLoaded={player.onLoaded}
              onPlay={(media) => player.play(current, media)}
            />
          </PlayerDock>
        ) : (
          body
        )}
      </AnimatedHeight>
    ),
  };
}

/** What a playable card's switch picks: a service, or its card. */
type EmbedChoice = PlayerProvider | typeof CARD_PLAYER;

interface EmbedPlayerProps {
  card: TPinakesResourceDetail;
  title: string;
  /** The service shown (the switch's pick, else the first in Players order). */
  target: PlayerTarget;
  player: ResourcePlayerState;
  surface?: PostActionSurface;
  preview: boolean;
  /** Platform embeds up front, or Play on pressed here with them off: the player shows. */
  showsPlayer: boolean;
  /** Play on pressed with platform embeds up front off (`true`), or the player let go (`false`). */
  onOptIn: (on: boolean) => void;
}

/**
 * A playable card's player up front: its service's embed, paused (`getUpFrontTarget`). Its playing
 * makes it the page's player, which then docks (never in a preview) until other media starts or
 * Close. With platform embeds up front off, a stand-in with Play on loads nothing from the services.
 */
function EmbedPlayer({
  card,
  title,
  target,
  player,
  surface = 'muted',
  preview,
  showsPlayer,
  onOptIn,
}: EmbedPlayerProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  // The player was opened by Play on: it starts on load, as the card's Play on does.
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

  const frameKey = `${target.provider}:${round}`;
  // Platform embeds turned off while this player was the page's: its frame is gone, so is its claim.
  useEffect(() => {
    if (!showsPlayer && isActive) player.close();
  }, [showsPlayer, isActive, player]);

  const close = () => {
    if (boxRef.current) pauseMedia(boxRef.current);
    player.close();
  };

  const open = () => {
    onOptIn(true);
    if (preview) return;
    setAutoStart(true);
    player.play(target);
  };

  if (!showsPlayer) {
    const label = preview ? `Show the ${target.name} player` : `Play on ${target.name}`;
    const summary = getResourceSummary(card);
    return (
      <Container
        overrideDefaults
        data-resource-controls
        data-testid="embed-player"
        className="flex min-w-0 items-center gap-3"
      >
        <Button
          variant="secondary"
          size="sm"
          aria-label={label}
          title={label}
          onClick={open}
          className={postActionsButtonVariants({ surface })}
        >
          <Play aria-hidden="true" className="fill-current" />
        </Button>
        <Container overrideDefaults className="flex min-w-0 flex-1 flex-col">
          <Typography as="span" size="sm" dir="auto" className="truncate font-bold text-foreground">
            {title}
          </Typography>
          {summary && (
            <Typography as="span" size="xs" dir="auto" className="truncate font-normal text-muted-foreground">
              {summary}
            </Typography>
          )}
        </Container>
      </Container>
    );
  }

  return (
    <div ref={boxRef} data-resource-controls data-testid="embed-player" className="min-w-0">
      <PlayerDock target={target} title={title} onClose={close} dockable={isActive && !preview}>
        <ResourcePlayerFrame
          key={frameKey}
          target={autoStart ? target : getUpFrontTarget(target)}
          title={title}
          // Opened by Play on, it is the page's player (`player.current`): its load state, with the
          // service's page when it has not answered. Up front, quiet, it only hides its placeholder.
          load={autoStart && isActive ? player.load : loadedKey === frameKey ? 'ready' : 'loading'}
          onLoaded={autoStart && isActive ? player.onLoaded : () => setLoadedKey(frameKey)}
          quiet={!autoStart}
          onPlay={(media) => player.play(target, media)}
        />
      </PlayerDock>
    </div>
  );
}

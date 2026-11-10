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
  isSong,
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
   * A song's player, shown up front where the card's image and text would be (`SongPlayer`); the
   * card then has no Play on. Absent for anything else.
   */
  embed?: ReactNode;
  /**
   * A song shown as its card instead (its switch's Card, or Card (no player) above its first
   * service in Players): `renderBody` puts the switch above the card's body; no service's embed
   * loads, up front or otherwise.
   */
  isCard?: boolean;
}

export interface CardPlayerOptions {
  /**
   * A preview (the composer): only a song's player; it takes the page when it plays but never docks;
   * with platform embeds up front off, its button shows the player paused.
   */
  preview?: boolean;
}

/**
 * The services' own players for a card, wherever a card with an action row renders (a post's
 * embed, the resource page): "Play on <service>" plays the first service the card is on that
 * allows embedding (`getPlayerTargets`: the card's own link first, then `also_on`), its chevron
 * picks another. The player takes the place of the card's image and text; header, details, actions
 * and tags stay, and the same pill closes it. A player whose card scrolls away keeps playing in a
 * dock at the bottom of the screen (`PlayerDock`). One player plays on the whole page.
 *
 * No player is loaded before Play is pressed (the pill shows the service's favicon). A card on no
 * such service gets neither. The viewer's Players (Settings, Links & Media) order the services and
 * leave out removed ones.
 *
 * A song (`isSong`, read `ok`) shows its player up front instead (`embed`, `SongPlayer`), with a
 * switch to its other services and Card. Card, or Card (no player) above its first service in
 * Players, shows the song's card with the switch above its body (`isCard`).
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
  // What the viewer picked in this song's switch, a service or Card, for this resource only.
  const [picked, setPicked] = useState<{ uri: string; choice: SongChoice } | null>(null);
  const song = card !== null && isSong(card) && getResourceStatus(card.status) === PinakesStatus.OK;
  // A song's player starts on no press of ours: its services stay in Pinakes' order.
  const targets = card
    ? getPlayerTargets(card, { href, players: { playerOrder, hiddenPlayers }, autoplayFirst: !song })
    : [];
  const player = useResourcePlayer(owner, targets);
  if (!card || targets.length === 0) return {};

  const title = card.name?.trim() || href || card.uri;
  if (song) {
    // Another resource starts over: nothing picked, the Players order again (its first service, or
    // the card when Card (no player) is above that service).
    const choice =
      (picked?.uri === card.uri ? picked.choice : null) ??
      (isCardFirst(targets[0].provider, playerOrder) ? CARD_PLAYER : null);
    const choose = (next: SongChoice) => setPicked({ uri: card.uri, choice: next });
    if (choice === CARD_PLAYER) {
      return {
        isCard: true,
        renderBody: (body) => (
          <>
            <PlayerSwitch
              targets={targets}
              current={null}
              onSelect={(target) => choose(target.provider)}
              onShowCard={() => choose(CARD_PLAYER)}
              icons={embedsUpFront}
              surface={surface}
            />
            {body}
          </>
        ),
      };
    }
    return {
      embed: (
        // A new resource starts over: no service picked, no Play on pressed. The same one (new
        // counts or tags) keeps its player.
        <SongPlayer
          key={card.uri}
          card={card}
          title={title}
          targets={targets}
          choice={choice}
          onChoose={choose}
          player={player}
          surface={surface}
          preview={preview}
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

/** What a song's switch picks: a service, or its card. */
type SongChoice = PlayerProvider | typeof CARD_PLAYER;

interface SongPlayerProps {
  card: TPinakesResourceDetail;
  title: string;
  targets: PlayerTarget[];
  /** The service picked in the switch; `null`: the first of `targets` (the Players order). */
  choice: SongChoice | null;
  /** Picks a service, or Card (`CARD_PLAYER`), for this song. */
  onChoose: (choice: SongChoice) => void;
  player: ResourcePlayerState;
  surface?: PostActionSurface;
  preview: boolean;
}

/**
 * A song's player up front: its chosen service's embed, paused (`getUpFrontTarget`), with a switch
 * to the others and Card (`PlayerSwitch`). Its playing makes it the page's player, which then docks
 * (never in a preview) until other media starts or Close. With platform embeds up front off, a
 * stand-in with Play on loads nothing from the services.
 */
function SongPlayer({ card, title, targets, choice, onChoose, player, surface = 'muted', preview }: SongPlayerProps) {
  const embedsUpFront = useSettingsStore((state) => state.media.embedsUpFront);
  const boxRef = useRef<HTMLDivElement>(null);
  // Pressed Play on here with platform embeds up front off: the player shows from then on.
  const [optedIn, setOptedIn] = useState(false);
  // The player was opened by that press: it starts on load, as the card's Play on does.
  const [autoStart, setAutoStart] = useState(false);
  // A new frame for the same service: what played in the old one stops.
  const [round, setRound] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const selected = targets.find((target) => target.provider === choice) ?? targets[0];
  // Says when it plays, and pauses where it is: an audio file and the players that tell
  // (`tellsWhenPlaying`); any other starts by a press inside it (`ResourcePlayerFrame`).
  const tells = selected.element === 'audio' || tellsWhenPlaying(selected.src);
  const isActive = player.current !== null;
  // Other media started (it paused this one), or the dock closed this one: a player that pauses
  // stays as it is; any other is loaded anew, paused.
  const [wasActive, setWasActive] = useState(isActive);
  if (wasActive !== isActive) {
    setWasActive(isActive);
    if (!isActive) {
      if (!tells) setRound((value) => value + 1);
      setOptedIn(false);
      setAutoStart(false);
    }
  }

  const showsPlayer = embedsUpFront || optedIn;
  const frameKey = `${selected.provider}:${round}`;
  // Platform embeds turned off while this player was the page's: its frame is gone, so is its claim.
  useEffect(() => {
    if (!showsPlayer && isActive) player.close();
  }, [showsPlayer, isActive, player]);

  const select = (target: PlayerTarget) => {
    if (target.provider === selected.provider) return;
    if (isActive) {
      // Switching is no Close: a viewer who pressed Play on keeps seeing a player.
      setWasActive(false);
      player.close();
    }
    setAutoStart(false);
    setRound((value) => value + 1);
    onChoose(target.provider);
  };

  // The card stands instead: what played here stops being the page's player.
  const showCard = () => {
    if (isActive) player.close();
    onChoose(CARD_PLAYER);
  };

  const close = () => {
    if (boxRef.current) pauseMedia(boxRef.current);
    player.close();
  };

  const open = () => {
    setOptedIn(true);
    if (preview) return;
    setAutoStart(true);
    player.play(selected);
  };

  const switcher = (
    <PlayerSwitch
      targets={targets}
      current={selected}
      onSelect={select}
      onShowCard={showCard}
      icons={showsPlayer}
      surface={surface}
    />
  );

  if (!showsPlayer) {
    const label = preview ? `Show the ${selected.name} player` : `Play on ${selected.name}`;
    const summary = getResourceSummary(card);
    return (
      <Container
        overrideDefaults
        data-resource-controls
        data-testid="song-player"
        className="flex min-w-0 items-center gap-3 p-3"
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
        {switcher}
      </Container>
    );
  }

  return (
    <Container
      overrideDefaults
      data-resource-controls
      data-testid="song-player"
      className="flex min-w-0 flex-col gap-2"
    >
      {switcher}
      <div ref={boxRef} className="min-w-0">
        <PlayerDock target={selected} title={title} onClose={close} dockable={isActive && !preview}>
          <ResourcePlayerFrame
            key={frameKey}
            target={autoStart ? selected : getUpFrontTarget(selected)}
            title={title}
            // Opened by Play on, it is the page's player (`player.current`): its load state, with the
            // service's page when it has not answered. Up front, quiet, it only hides its placeholder.
            load={autoStart && isActive ? player.load : loadedKey === frameKey ? 'ready' : 'loading'}
            onLoaded={autoStart && isActive ? player.onLoaded : () => setLoadedKey(frameKey)}
            quiet={!autoStart}
            onPlay={(media) => player.play(selected, media)}
          />
        </PlayerDock>
      </div>
    </Container>
  );
}

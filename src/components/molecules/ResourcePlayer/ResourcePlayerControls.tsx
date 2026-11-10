'use client';

import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, LinkIcon, Play, X } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/atoms/DropdownMenu/DropdownMenu';
import { Typography } from '@/atoms/Typography/Typography';
import { KEEP_PLAYING_ATTRIBUTE } from '@/hooks/usePauseMediaOutsideViewport/usePauseMediaOutsideViewport';
import { cn } from '@/libs/utils/utils';
import { ResourceSourceIcon } from '@/molecules/ResourceCard/ResourceSourceIcon';
import { PostActionButton, type PostActionSurface } from '@/organisms/PostActionsBar/PostActionButton';
import { postActionsButtonVariants } from '@/organisms/PostActionsBar/PostActionsBar.variants';
import type { PlayerTarget } from './resourcePlayer.utils';
import type { ResourcePlayerState } from './useResourcePlayer';

interface ProviderMenuProps {
  targets: PlayerTarget[];
  /** The service shown now (playing, or a song's player up front), or `null`. */
  current: PlayerTarget | null;
  onSelect: (target: PlayerTarget) => void;
  /** Closes the open player: a "Close player" row while `current` is set. */
  onClose?: () => void;
  trigger: ReactNode;
  /** Each row's favicon; off where nothing may load from the services yet (platform embeds off). */
  icons?: boolean;
  /** The menu's accessible name: what picking a row does. */
  label?: string;
  /** A "Card" row after the services: shows the link's card instead of a player, current while `current` is `null`. */
  onShowCard?: () => void;
}

const ROW = 'group gap-2 p-0';
const ROW_TEXT = 'truncate text-base font-medium transition-colors group-hover:text-foreground';

/**
 * The services to play on, in the post menu's style: one line per service (favicon and name), the
 * current one in full colour with a check, then Card where the link's card can stand instead of a
 * player (a song's switch), then Close when there is a player to close.
 */
function ProviderMenu({
  targets,
  current,
  onSelect,
  onClose,
  trigger,
  icons = true,
  label = 'Play on',
  onShowCard,
}: ProviderMenuProps) {
  const cardShown = current === null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        aria-label={label}
        className="flex w-56 flex-col gap-2.5"
        data-testid="play-on-menu"
      >
        {targets.map((target) => {
          const playing = current?.provider === target.provider;
          return (
            <DropdownMenuItem
              key={target.provider}
              data-testid="play-on-row"
              aria-current={playing || undefined}
              onSelect={() => onSelect(target)}
              className={ROW}
            >
              {icons && <ResourceSourceIcon uri={target.link} />}
              <Typography
                as="span"
                overrideDefaults
                className={cn(ROW_TEXT, 'min-w-0 flex-1', playing ? 'text-foreground' : 'text-muted-foreground')}
              >
                {target.name}
              </Typography>
              {playing && <Check aria-hidden="true" className="size-4 shrink-0 text-brand" />}
            </DropdownMenuItem>
          );
        })}
        {onShowCard && (
          <DropdownMenuItem
            data-testid="play-on-card"
            aria-label="Show the link card instead of a player"
            aria-current={cardShown || undefined}
            onSelect={onShowCard}
            className={ROW}
          >
            {icons && (
              <LinkIcon
                aria-hidden="true"
                className={cn(
                  'size-4 shrink-0 transition-colors group-hover:text-foreground',
                  cardShown ? 'text-foreground' : 'text-muted-foreground',
                )}
              />
            )}
            <Typography
              as="span"
              overrideDefaults
              className={cn(ROW_TEXT, 'min-w-0 flex-1', cardShown ? 'text-foreground' : 'text-muted-foreground')}
            >
              Card
            </Typography>
            {cardShown && <Check aria-hidden="true" className="size-4 shrink-0 text-brand" />}
          </DropdownMenuItem>
        )}
        {current && onClose && (
          <DropdownMenuItem onSelect={onClose} className={ROW}>
            <X
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            />
            <Typography as="span" overrideDefaults className={cn(ROW_TEXT, 'text-muted-foreground')}>
              Close player
            </Typography>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The card's player, on its own line above the footer, in the action row's pills (`PostActionButton`'s):
 * ▶ and the service's logo play the first service; while it plays, the logo and ✕ close it. The service's
 * name is in the accessible name. A chevron pill beside it picks another service, only when there
 * is one.
 */
export function PlayOnSplit({
  targets,
  player,
  surface = 'muted',
}: {
  targets: PlayerTarget[];
  player: ResourcePlayerState;
  /** What the card's footer sits on (`PostActionButton`'s `surface`). */
  surface?: PostActionSurface;
}) {
  const shown = player.current ?? targets[0];
  if (!shown) return null;
  const isOpen = player.current !== null;
  const hasMenu = targets.length > 1;
  const label = isOpen ? `Close the ${shown.name} player` : `Play on ${shown.name}`;
  return (
    <Container overrideDefaults role="group" aria-label="Player" className="flex shrink-0 items-center gap-px">
      <PlayOnPill
        uri={shown.link}
        isOpen={isOpen}
        label={label}
        surface={surface}
        onClick={() => (isOpen ? player.close() : player.play(shown))}
        data-testid="play-on-main"
        className={cn(hasMenu && 'rounded-r-none')}
      />
      {hasMenu && (
        <ProviderMenu
          targets={targets}
          current={player.current}
          onSelect={player.play}
          onClose={player.close}
          trigger={
            <PostActionButton
              icon={ChevronDown}
              surface={surface}
              ariaLabel="Play on another service"
              data-testid="play-on-trigger"
              className="rounded-l-none"
            />
          }
        />
      )}
    </Container>
  );
}

/**
 * A song's switch above its player (`useCardPlayer`): the shown service's favicon, name and a
 * chevron, in the action row's pill style, opening the services to show instead (`ProviderMenu`),
 * then Card. Picking one only switches the player shown; it never starts it. While the card shows
 * (`current` is `null`), the switch reads Card.
 */
export function PlayerSwitch({
  targets,
  current,
  onSelect,
  onShowCard,
  icons = true,
  surface = 'muted',
}: {
  targets: PlayerTarget[];
  /** The service shown, or `null` while the song shows its card. */
  current: PlayerTarget | null;
  onSelect: (target: PlayerTarget) => void;
  onShowCard: () => void;
  /** The favicons; off where nothing may load from the services yet. */
  icons?: boolean;
  surface?: PostActionSurface;
}) {
  const name = current?.name ?? 'Card';
  return (
    <ProviderMenu
      targets={targets}
      current={current}
      onSelect={onSelect}
      onShowCard={onShowCard}
      icons={icons}
      label="Choose service"
      trigger={
        <Button
          variant="secondary"
          size="sm"
          aria-label={`${name}: choose another service`}
          data-testid="player-switch"
          className={cn(postActionsButtonVariants({ surface }), 'w-fit max-w-full')}
        >
          {icons && (current ? <ResourceSourceIcon uri={current.link} /> : <LinkIcon aria-hidden="true" />)}
          <Typography as="span" overrideDefaults className="truncate">
            {name}
          </Typography>
          <ChevronDown aria-hidden="true" />
        </Button>
      }
    />
  );
}

/**
 * The player pill in the action row's own buttons: ▶ and the service's logo, while open the logo and
 * ✕; the label (the service's name) is its accessible name and tooltip. `PlayOnSplit`'s main part,
 * and an X post's "Show on" on its card (`NativeEmbedResource`).
 */
export function PlayOnPill({
  uri,
  isOpen,
  label,
  surface = 'muted',
  className,
  ...props
}: {
  /** The link whose service's logo the pill shows. */
  uri: string;
  isOpen: boolean;
  label: string;
  surface?: PostActionSurface;
} & Omit<ComponentProps<typeof Button>, 'variant' | 'size' | 'children' | 'aria-label' | 'title'>) {
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-label={label}
      title={label}
      className={cn(postActionsButtonVariants({ surface }), className)}
      {...props}
    >
      {!isOpen && <Play aria-hidden="true" className="fill-current" />}
      <ResourceSourceIcon uri={uri} />
      {isOpen && <X aria-hidden="true" />}
    </Button>
  );
}

/**
 * Keeps an open player on screen when its card scrolls away: the player's box becomes a small fixed
 * dock (CSS only, the frame is never moved, so it keeps playing) with Close and a way back; back in
 * view it returns to the card. The dock sits above the phone's bottom bar and left of the new-post
 * button (Fab: right-3 bottom-18 size-20, sm:right-10, md:bottom-20, lg:bottom-6), so it never
 * covers either. Audio uses the service's compact height; video keeps its ratio at the dock's width.
 * A player nobody started (a song's player shown up front, `dockable` off) stays in its card, and a
 * post pauses it off screen like any embed.
 */
export function PlayerDock({
  target,
  title,
  onClose,
  dockable = true,
  children,
}: {
  target: PlayerTarget;
  title: string;
  onClose: () => void;
  dockable?: boolean;
  children: ReactNode;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [isOffScreen, setIsOffScreen] = useState(false);
  const [slotHeight, setSlotHeight] = useState<number | null>(null);
  const docked = dockable && isOffScreen;

  useEffect(() => {
    const slot = slotRef.current;
    if (!dockable || !slot || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && boxRef.current && !boxRef.current.dataset.docked) {
          setSlotHeight(boxRef.current.offsetHeight);
        }
        setIsOffScreen(!entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(slot);
    return () => {
      observer.disconnect();
      setIsOffScreen(false);
    };
  }, [dockable]);

  const backToCard = () => slotRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <div
      ref={slotRef}
      style={docked && slotHeight ? { height: slotHeight } : undefined}
      className={cn('relative min-w-0', docked && 'rounded-md border border-dashed border-border')}
      data-testid="player-dock-slot"
      data-docked={docked ? 'true' : undefined}
    >
      {docked && (
        <Container overrideDefaults className="flex h-full items-center justify-center p-3">
          <Button
            variant="outline"
            size="sm"
            aria-label={`Back to ${title}`}
            data-testid="player-dock-slot-back"
            onClick={backToCard}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
        </Container>
      )}
      <div
        ref={boxRef}
        data-docked={docked ? 'true' : undefined}
        className={cn(
          docked && [
            'fixed right-26 bottom-18 left-3 z-40 flex items-start gap-1 rounded-lg border border-border bg-popover p-1 shadow-2xl',
            'sm:right-34 sm:left-auto sm:w-96 md:bottom-20 lg:bottom-6 [&_[data-player-region]]:h-(--player-dock-h)',
          ],
        )}
        // A post pauses its media once off screen (`usePauseMediaOutsideViewport`); the player then
        // plays on in the dock.
        {...(dockable && { [KEEP_PLAYING_ATTRIBUTE]: 'true' })}
        role={docked ? 'complementary' : undefined}
        aria-label={docked ? `Player dock: ${title}` : undefined}
      >
        <div className="min-w-0 flex-1">{children}</div>
        {docked && (
          <Container overrideDefaults className="flex shrink-0 flex-col" data-testid="player-dock-bar">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Close the ${target.name} player`}
              data-testid="player-dock-close"
              onClick={onClose}
              className="size-8 text-muted-foreground hover:text-foreground"
            >
              <X aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Back to ${title}`}
              data-testid="player-dock-back"
              onClick={backToCard}
              className="size-8 text-muted-foreground hover:text-foreground"
            >
              <ArrowUp aria-hidden="true" />
            </Button>
          </Container>
        )}
      </div>
    </div>
  );
}

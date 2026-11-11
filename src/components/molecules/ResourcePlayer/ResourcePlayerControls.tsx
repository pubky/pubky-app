'use client';

import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, LinkIcon, Play, X } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/atoms/DropdownMenu/DropdownMenu';
import { Typography } from '@/atoms/Typography/Typography';
import { KEEP_PLAYING_ATTRIBUTE } from '@/hooks/usePauseMediaOutsideViewport/usePauseMediaOutsideViewport';
import { cn } from '@/libs/utils/utils';
import { ResourceMaybeLabel } from '@/molecules/ResourceCard/ResourceMaybeLabel';
import { ResourceSourceIcon } from '@/molecules/ResourceCard/ResourceSourceIcon';
import type { PostActionSurface } from '@/organisms/PostActionsBar/PostActionButton';
import { postActionsButtonVariants } from '@/organisms/PostActionsBar/PostActionsBar.variants';
import { DOCK_CLASS, DOCK_SLOT_CLASS, DockBar, DockSlotBack, PlayerSlot, usePlayerHost } from './PlayerHost';
import type { PlayerTarget } from './resourcePlayer.utils';

interface ProviderMenuProps {
  targets: PlayerTarget[];
  /** The service shown now (playing, or a song's player up front), or `null`. */
  current: PlayerTarget | null;
  onSelect: (target: PlayerTarget) => void;
  trigger: ReactNode;
  /** Each row's favicon; off where nothing may load from the services yet (platform embeds off). */
  icons?: boolean;
  /** The menu's accessible name: what picking a row does. */
  label: string;
  /** A "Card" row before the services: shows the link's card instead of a player, current while `current` is `null`. */
  onShowCard?: () => void;
}

const ROW = 'group gap-2 p-0';
/** What a service's "maybe" says in its accessible name: its link is possibly not the same thing. */
const MAYBE_NOTE = 'maybe the same';
const ROW_TEXT = 'truncate text-base font-medium transition-colors group-hover:text-foreground';

/**
 * The services to play on, in the post menu's style: one line per service (favicon and name), the
 * current one in full colour with a check. Where the link's card can stand instead of a player (a
 * card's switch), Card comes first, set apart from the services by the menu's separator. A service
 * whose link is a match by metadata (`maybe`) says "maybe" after its name.
 */
function ProviderMenu({ targets, current, onSelect, trigger, icons = true, label, onShowCard }: ProviderMenuProps) {
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
        {onShowCard && (
          <>
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
            {targets.length > 0 && <DropdownMenuSeparator className="-mx-4 my-0" />}
          </>
        )}
        {targets.map((target) => {
          const playing = current?.provider === target.provider;
          return (
            <DropdownMenuItem
              key={target.provider}
              data-testid="play-on-row"
              aria-label={target.maybe ? `${target.name}, ${MAYBE_NOTE}` : undefined}
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
              {target.maybe && <ResourceMaybeLabel />}
              {playing && <Check aria-hidden="true" className="size-4 shrink-0 text-brand" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A card's embed/card switch, in the header of its frame or card (`useCardPlayer`'s `switcher`): the
 * shown service's favicon, name and a chevron, in the action row's pill style, opening Card and,
 * below a separator, the services to show instead (`ProviderMenu`). Picking one only switches
 * the player shown; it never starts it. While the card shows (`current` is `null`), the switch reads Card;
 * a service whose link is a match by metadata says "maybe" after its name here too.
 * On a phone it shows the favicon (or the card's link icon) and the chevron only; the name stays in
 * its accessible name.
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
  /** The service shown, or `null` while the card shows instead. */
  current: PlayerTarget | null;
  onSelect: (target: PlayerTarget) => void;
  onShowCard: () => void;
  /** The favicons; off where nothing may load from the services yet. */
  icons?: boolean;
  surface?: PostActionSurface;
}) {
  const name = current?.name ?? 'Card';
  // A match by metadata says so in the trigger's name too (`ResourceMaybeLabel` shows it).
  const label = current?.maybe ? `${name}, ${MAYBE_NOTE}` : name;
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
          aria-label={`${label}: choose another service`}
          data-testid="player-switch"
          className={cn(postActionsButtonVariants({ surface }), 'w-fit max-w-full')}
        >
          {icons && (current ? <ResourceSourceIcon uri={current.link} /> : <LinkIcon aria-hidden="true" />)}
          <Typography as="span" overrideDefaults className={cn('truncate', icons && 'max-sm:hidden')}>
            {name}
          </Typography>
          {current?.maybe && <ResourceMaybeLabel />}
          <ChevronDown aria-hidden="true" />
        </Button>
      }
    />
  );
}

/**
 * The player pill in the action row's own buttons: ▶ and the service's logo, while open the logo and
 * ✕; the label (the service's name) is its accessible name and tooltip: an X post's "Show on" on
 * its card (`NativeEmbedResource`).
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

/** The page's player a card's frame is (`useResourcePlayer`'s owner), and the card's resource. */
export interface PagePlayer {
  owner: string;
  resource: string;
}

/**
 * Keeps an open player on screen when its card scrolls away: the player's box becomes a small fixed
 * dock (CSS only, the frame is never moved, so it keeps playing) with Close and a way back; back in
 * view it returns to the card. The dock sits above the phone's bottom bar and left of the new-post
 * button, so it never covers either (`DOCK_CLASS`). Audio uses the service's compact height; video
 * keeps its ratio at the dock's width. A player nobody started (a player shown up front, `dockable` off)
 * stays in its card, and a post pauses it off screen like any embed. Here (no player host: tests, a
 * tree outside the app) a paused player is not `dockable`, so one paused in this dock goes back to
 * its card; the host keeps one paused in the dock there.
 *
 * In the app (`PlayerHost`), a card's player (`pagePlayer`, never a preview's) is kept by the host
 * instead (`PlayerSlot`): laid over the card, and, while it is the page's player, in the dock when
 * no card of it is on screen, also on another page; `dockable` is then the host's call.
 */
export function PlayerDock({
  pagePlayer,
  ...props
}: PlayerDockProps & {
  /** The page's player the frame is: kept by the app's player host, where there is one. */
  pagePlayer?: PagePlayer;
}) {
  const host = usePlayerHost();
  if (host && pagePlayer) {
    return (
      <PlayerSlot {...pagePlayer} target={props.target} title={props.title} onClose={props.onClose}>
        {props.children}
      </PlayerSlot>
    );
  }
  return <PlayerDockInPlace {...props} />;
}

interface PlayerDockProps {
  target: PlayerTarget;
  title: string;
  onClose: () => void;
  dockable?: boolean;
  children: ReactNode;
}

/** `PlayerDock` with no player host: the dock is the player's own box, fixed by CSS. */
function PlayerDockInPlace({ target, title, onClose, dockable = true, children }: PlayerDockProps) {
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
      className={cn('relative min-w-0', docked && DOCK_SLOT_CLASS)}
      data-testid="player-dock-slot"
      data-docked={docked ? 'true' : undefined}
    >
      {docked && <DockSlotBack title={title} onBack={backToCard} />}
      <div
        ref={boxRef}
        data-docked={docked ? 'true' : undefined}
        className={cn(docked && DOCK_CLASS)}
        // A post pauses its media once off screen (`usePauseMediaOutsideViewport`); the player then
        // plays on in the dock.
        {...(dockable && { [KEEP_PLAYING_ATTRIBUTE]: 'true' })}
        role={docked ? 'complementary' : undefined}
        aria-label={docked ? `Player dock: ${title}` : undefined}
      >
        <div className="min-w-0 flex-1">{children}</div>
        {docked && <DockBar target={target} title={title} onClose={onClose} onBack={backToCard} />}
      </div>
    </div>
  );
}

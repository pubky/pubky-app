'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, X } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { onMediaStop } from '@/hooks/useOnePlayer/useOnePlayer';
import { KEEP_PLAYING_ATTRIBUTE } from '@/hooks/usePauseMediaOutsideViewport/usePauseMediaOutsideViewport';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { pauseMedia } from '@/libs/utils/mediaPlayback';
import { cn } from '@/libs/utils/utils';
import type { PlayerProvider, PlayerTarget } from './resourcePlayer.utils';
import { type ActivePlayer, getPagePlayer, usePagePlayer } from './useResourcePlayer';

/**
 * The dock's box: small, fixed above the phone's bottom bar and left of the new-post button (Fab:
 * right-3 bottom-18 size-20, sm:right-10, md:bottom-20, lg:bottom-6), so it covers neither; audio at
 * the service's compact height (`--player-dock-h`).
 */
export const DOCK_CLASS = [
  'fixed right-26 bottom-18 left-3 z-40 flex items-start gap-1 rounded-lg border border-border bg-popover p-1 shadow-2xl',
  'sm:right-34 sm:left-auto sm:w-96 md:bottom-20 lg:bottom-6 [&_[data-player-region]]:h-(--player-dock-h)',
];

/** A card's place while its player is in the dock. */
export const DOCK_SLOT_CLASS = 'rounded-md border border-dashed border-border';

/** The dock's side column: Close, and the way back to the card. */
export function DockBar({ target, title, onClose, onBack }: DockActions & { target: PlayerTarget }) {
  return (
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
        onClick={onBack}
        className="size-8 text-muted-foreground hover:text-foreground"
      >
        <ArrowUp aria-hidden="true" />
      </Button>
    </Container>
  );
}

/** The icon-only way back left in the card's place while its player is in the dock. */
export function DockSlotBack({ title, onBack }: Pick<DockActions, 'title' | 'onBack'>) {
  return (
    <Container overrideDefaults className="flex h-full items-center justify-center p-3">
      <Button
        variant="outline"
        size="sm"
        aria-label={`Back to ${title}`}
        data-testid="player-dock-slot-back"
        onClick={onBack}
      >
        <ArrowUp aria-hidden="true" />
      </Button>
    </Container>
  );
}

interface DockActions {
  title: string;
  onClose: () => void;
  onBack: () => void;
}

/** A card's player frame, kept by the host (`PlayerHost`) and laid over the card's slot (`PlayerSlot`). */
interface HostedPlayer {
  /** The card's slot, or `null` once the card is gone: the frame then plays on in the dock, or goes. */
  slot: HTMLElement | null;
  /** The resource and the service: another card's slot for the same takes the frame while it plays. */
  match: string;
  /** The page's player it is (`useResourcePlayer`): it plays while that one is the page's. */
  owner: string;
  provider: PlayerProvider;
  target: PlayerTarget;
  title: string;
  /** The post the card is in (`PlayerFrom`): the dock's way back once no card of it is on the page. */
  post: string | null;
  /** The page the card was first shown on: the way back for a card in no post (the resource page). */
  page: string;
  onClose: () => void;
  frame: ReactNode;
}

/** A frame over its slot, in the dock, or hidden with its slot (a feed behind an open post). */
type Mode = 'attached' | 'docked' | 'hidden';

interface Placement {
  mode: Mode;
  /** The slot it is laid over or, while docked, the one Back scrolls to; `null`: none is on the page. */
  on: string | null;
}

/** A slot's part: a frame laid over it (`frame:<id>`), the way back to its docked frame (`away`), or none yet. */
type SlotView = `frame:${string}` | 'away' | '';

class PlayerHostStore {
  readonly players = new Map<string, HostedPlayer>();
  placements = new Map<string, Placement>();
  private views = new Map<string, SlotView>();
  /** Counts the changes that move frames (one comes or goes, its slot, link or player changes, they are placed). */
  private layout = 0;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getLayout = () => this.layout;

  get = (id: string): HostedPlayer | undefined => this.players.get(id);

  viewOf = (id: string): SlotView => this.views.get(id) ?? '';

  private emit(moves: boolean) {
    if (moves) this.layout += 1;
    this.listeners.forEach((listener) => listener());
  }

  /**
   * A card's player, as it renders now (its frame re-renders alone); it keeps its place among the others
   * (a moved frame loads anew).
   */
  set(id: string, player: HostedPlayer) {
    const before = this.players.get(id);
    this.players.set(id, player);
    this.emit(
      !before ||
        before.slot !== player.slot ||
        before.match !== player.match ||
        before.owner !== player.owner ||
        before.provider !== player.provider,
    );
  }

  /** Its card is gone: the frame stays while it plays, and goes after (`prune`). */
  release(id: string) {
    const player = this.players.get(id);
    if (!player) return;
    this.players.set(id, { ...player, slot: null });
    this.emit(true);
  }

  prune(ids: string[]) {
    ids.forEach((id) => this.players.delete(id));
    this.emit(true);
  }

  /** Takes the frames' new places; `false` when nothing changed. */
  place(placements: Map<string, Placement>, views: Map<string, SlotView>): boolean {
    const key = (map: Map<string, unknown>) => JSON.stringify(Array.from(map));
    if (key(placements) === key(this.placements) && key(views) === key(this.views)) return false;
    this.placements = placements;
    this.views = views;
    this.emit(true);
    return true;
  }
}

const PlayerHostContext = createContext<PlayerHostStore | null>(null);

const PlayerFromContext = createContext<string | null>(null);

/** The post around its card players (composite id): the dock's Back leads there once no card of them is on the page. */
export function PlayerFrom({ postId, children }: { postId: string; children: ReactNode }) {
  return <PlayerFromContext.Provider value={postId}>{children}</PlayerFromContext.Provider>;
}

/** The app's player host, or `null` where none is mounted (a unit test, a tree outside the app). */
export function usePlayerHost(): PlayerHostStore | null {
  return useContext(PlayerHostContext);
}

const isPlaying = (player: HostedPlayer, active: ActivePlayer) =>
  active?.owner === player.owner && active.provider === player.provider;

function findPlaying(players: Map<string, HostedPlayer>, active: ActivePlayer): string | null {
  for (const [id, player] of players) if (isPlaying(player, active)) return id;
  return null;
}

/** Laid out on the page: not gone, not inside something hidden (`display: none`). */
const isShown = (slot: HTMLElement) => slot.isConnected && slot.getClientRects().length > 0;

/**
 * Where each frame goes. The playing one is laid over its own card while that is on the page, else
 * over the latest card of the same resource and service (a post opened from the feed, the feed
 * again after another page), whose own frame then waits; with no such card on the page, or that
 * card scrolled away, it is in the dock. Paused or ended in its card (`paused`, not `docked` before)
 * it does not dock: it stays over that card, also scrolled away, and hidden with it (a feed behind an
 * open post); leaving that card's page closes it (`PlayerHost`); paused in the dock, it stays there.
 * Any other frame stays over its card, hidden with it (and unloaded meanwhile, `HostedFrame`).
 */
function placePlayers(
  players: Map<string, HostedPlayer>,
  playing: string | null,
  isOnScreen: (slot: HTMLElement) => boolean,
  { paused = false, docked = false }: { paused?: boolean; docked?: boolean } = {},
): { placements: Map<string, Placement>; views: Map<string, SlotView> } {
  const placements = new Map<string, Placement>();
  const views = new Map<string, SlotView>();
  const shown = (id: string) => {
    const slot = players.get(id)?.slot;
    return slot ? isShown(slot) : false;
  };
  const current = playing ? players.get(playing) : undefined;
  let on: string | null = playing && shown(playing) ? playing : null;
  if (playing && current && !on) {
    for (const [id, player] of players) {
      if (id !== playing && player.match === current.match && shown(id)) on = id;
    }
  }
  const stays = paused && !docked;
  for (const [id, player] of players) {
    if (id === playing) {
      const slot = on ? players.get(on)?.slot : null;
      const attached = slot ? stays || isOnScreen(slot) : false;
      placements.set(id, { mode: attached ? 'attached' : stays ? 'hidden' : 'docked', on });
      if (on) views.set(on, attached ? `frame:${id}` : 'away');
    } else if (player.slot && id !== on) {
      placements.set(id, { mode: shown(id) ? 'attached' : 'hidden', on: id });
      views.set(id, `frame:${id}`);
    }
  }
  return { placements, views };
}

/** The boxes that clip a slot (an animating height, a scrolling list), nearest first; kept per slot. */
const clippers = new WeakMap<HTMLElement, HTMLElement[]>();

function getClippers(slot: HTMLElement): HTMLElement[] {
  let found = clippers.get(slot);
  if (!found) {
    found = [];
    for (let box = slot.parentElement; box && box !== document.body; box = box.parentElement) {
      const { overflowX, overflowY } = getComputedStyle(box);
      if (overflowX !== 'visible' || overflowY !== 'visible') found.push(box);
    }
    clippers.set(slot, found);
  }
  return found;
}

/** The part of the slot's box (`rect`) its clipping boxes and the viewport let show. */
function getVisibleBox(slot: HTMLElement, rect: DOMRect) {
  let { top, left, right, bottom } = rect;
  for (const box of getClippers(slot).map((element) => element.getBoundingClientRect())) {
    top = Math.max(top, box.top);
    left = Math.max(left, box.left);
    right = Math.min(right, box.right);
    bottom = Math.min(bottom, box.bottom);
  }
  return { top, left, right, bottom };
}

/** Some of the slot shows in the viewport (one without its height yet: its top does). */
const isOnScreen = (slot: HTMLElement) => {
  const { top, left, right, bottom } = getVisibleBox(slot, slot.getBoundingClientRect());
  return (
    bottom >= top && right > left && bottom > 0 && top < window.innerHeight && right > 0 && left < window.innerWidth
  );
};

function setStyle(
  element: HTMLElement,
  style: Partial<Record<'top' | 'left' | 'width' | 'height' | 'clipPath' | 'visibility', string>>,
) {
  for (const [name, value] of Object.entries(style) as [keyof typeof style, string][]) {
    if (element.style[name] !== value) element.style[name] = value;
  }
}

const frameId = (id: string) => `hosted-player-${id}`;

/**
 * The app's player host, mounted once at the root around the app: it keeps the frame of every card's
 * player (`PlayerSlot`), so the page's player plays on through every navigation. A frame is never
 * moved in the page (a moved iframe loads anew): it is laid over its card's slot (synced to the
 * slot's box on scroll, resize and size changes, at most once a frame; the slot takes the frame's
 * height), and the playing one goes to the dock when no card of it is on screen (scrolled away, a
 * post open over the feed, another page). Any other frame hidden with its card is unloaded until the
 * card shows again. A frame whose card is gone is let go once it no longer plays; a full page load
 * still stops it.
 */
export function PlayerHost({ children }: { children: ReactNode }) {
  const [store] = useState(() => new PlayerHostStore());
  useSyncExternalStore(store.subscribe, store.getLayout, store.getLayout);
  const active = usePagePlayer();
  const router = useRouter();
  const { getPostHref } = usePostNavigation();
  const layerRef = useRef<HTMLDivElement>(null);
  const [frames] = useState(() => new Map<string, HTMLDivElement>());
  const resizes = useRef<ResizeObserver | null>(null);

  const place = useEffectEvent(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const active = getPagePlayer();
    const playing = findPlaying(store.players, active);
    const { placements, views } = placePlayers(store.players, playing, isOnScreen, {
      paused: active?.paused === true,
      docked: playing !== null && store.placements.get(playing)?.mode === 'docked',
    });
    // Changed: placed again once rendered.
    if (store.place(placements, views)) return;
    const laid: [HTMLDivElement, HTMLElement][] = [];
    for (const [id, { mode, on }] of placements) {
      const frame = frames.get(id);
      const slot = on ? store.get(on)?.slot : null;
      if (!frame) continue;
      if (mode === 'attached' && slot) laid.push([frame, slot]);
      else setStyle(frame, { top: '', left: '', width: '', clipPath: '', visibility: '' });
    }
    // All reads before the writes: the slots' widths, the frames' heights at those widths (a slot taking its
    // height moves the slots below it), then the slots' places.
    const widths = laid.map(([, slot]) => slot.getBoundingClientRect().width);
    laid.forEach(([frame], i) => setStyle(frame, { width: `${widths[i]}px` }));
    const heights = laid.map(([frame]) => frame.offsetHeight);
    laid.forEach(([, slot], i) => setStyle(slot, { height: `${heights[i]}px` }));
    const origin = layer.getBoundingClientRect();
    const boxes = laid.map(([, slot]) => {
      const rect = slot.getBoundingClientRect();
      return { rect, box: getVisibleBox(slot, rect) };
    });
    laid.forEach(([frame], i) => {
      const { rect, box } = boxes[i];
      const clipped = box.top > rect.top || box.left > rect.left || box.right < rect.right || box.bottom < rect.bottom;
      setStyle(frame, {
        top: `${rect.top - origin.top}px`,
        left: `${rect.left - origin.left}px`,
        clipPath: clipped
          ? `inset(${Math.max(box.top - rect.top, 0)}px ${Math.max(rect.right - box.right, 0)}px ${Math.max(rect.bottom - box.bottom, 0)}px ${Math.max(box.left - rect.left, 0)}px)`
          : '',
        // Scrolled out of a box that clips it: nothing of it shows.
        visibility: box.bottom <= box.top || box.right <= box.left ? 'hidden' : '',
      });
    });
  });

  // Placed again after a scroll (also inside a scrolling box), a resize or a size change, once a frame.
  useLayoutEffect(() => {
    let request = 0;
    const schedule = () => {
      if (!request) {
        request = requestAnimationFrame(() => {
          request = 0;
          place();
        });
      }
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    resizes.current = observer;
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('transitionend', schedule, true);
    return () => {
      cancelAnimationFrame(request);
      observer.disconnect();
      resizes.current = null;
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('transitionend', schedule, true);
    };
  }, []);

  // Every render: watch each slot and frame for size changes, and place.
  const watched = useRef(new Set<Element>());
  useLayoutEffect(() => {
    const observer = resizes.current;
    if (observer) {
      const now = new Set<Element>(frames.values());
      store.players.forEach(({ slot }) => slot && now.add(slot));
      watched.current.forEach((element) => !now.has(element) && observer.unobserve(element));
      now.forEach((element) => !watched.current.has(element) && observer.observe(element));
      watched.current = now;
    }
    place();
  });

  // A frame whose card is gone is let go once it no longer plays, and stops when other media starts.
  // Paused in its card, leaving that card's page closes it (its card gone, none of it laid out yet):
  // nothing would show it. Only its place in the episode or song is lost.
  useEffect(() => {
    const active = getPagePlayer();
    const playing = findPlaying(store.players, active);
    const current = playing ? store.get(playing) : undefined;
    if (playing && current?.slot === null && active?.paused && store.placements.get(playing)?.mode === 'hidden') {
      current.onClose();
    }
    const gone = Array.from(store.players)
      .filter(([id, player]) => player.slot === null && id !== playing)
      .map(([id]) => id);
    if (gone.length > 0) store.prune(gone);
  });
  useEffect(
    () =>
      onMediaStop(() => {
        for (const player of store.players.values()) {
          if (player.slot === null && isPlaying(player, getPagePlayer())) player.onClose();
        }
      }),
    [store],
  );

  const playing = findPlaying(store.players, active);
  return (
    <PlayerHostContext.Provider value={store}>
      {children}
      <div ref={layerRef} className="absolute top-0 left-0 w-full" data-testid="player-host">
        {Array.from(store.placements, ([id, placement]) => (
          <HostedFrame
            key={id}
            id={id}
            store={store}
            placement={placement}
            playing={id === playing}
            frames={frames}
            onBack={({ post, page }) => {
              const slot = placement.on ? store.get(placement.on)?.slot : null;
              const to = post ? getPostHref(post) : page;
              if (slot) slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
              else if (`${location.pathname}${location.search}` === to) window.scrollTo({ top: 0, behavior: 'smooth' });
              else router.push(to);
            }}
          />
        ))}
      </div>
    </PlayerHostContext.Provider>
  );
}

/** One frame in the host: over its slot (`absolute`, placed by the host), in the dock, or hidden. */
function HostedFrame({
  id,
  store,
  placement: { mode },
  playing,
  frames,
  onBack,
}: {
  id: string;
  store: PlayerHostStore;
  placement: Placement;
  playing: boolean;
  frames: Map<string, HTMLDivElement>;
  onBack: (player: HostedPlayer) => void;
}) {
  // Its card's renders reach only this frame.
  const player = useSyncExternalStore(
    store.subscribe,
    () => store.get(id),
    () => store.get(id),
  );
  if (!player) return null;
  const docked = mode === 'docked';
  // A frame hidden with its card (a feed behind an open post) that is not the page's player is let
  // go until its card shows again, then loads anew: a hidden player loads nothing.
  const isIdle = mode === 'hidden' && !playing;
  const close = () => {
    const frame = frames.get(id);
    if (frame) pauseMedia(frame);
    player.onClose();
  };
  return (
    <div
      id={frameId(id)}
      ref={(node) => {
        if (node) frames.set(id, node);
        return () => {
          frames.delete(id);
        };
      }}
      data-testid="hosted-player"
      data-docked={docked ? 'true' : undefined}
      {...(playing && { [KEEP_PLAYING_ATTRIBUTE]: 'true' })}
      role={docked ? 'complementary' : undefined}
      aria-label={docked ? `Player dock: ${player.title}` : undefined}
      className={cn(mode === 'hidden' && 'hidden', mode === 'attached' && 'absolute z-10', docked && DOCK_CLASS)}
    >
      <div className="min-w-0 flex-1">{isIdle ? null : player.frame}</div>
      {docked && <DockBar target={player.target} title={player.title} onClose={close} onBack={() => onBack(player)} />}
    </div>
  );
}

interface PlayerSlotProps {
  /** The page's player the card's frame is (`useResourcePlayer`'s owner). */
  owner: string;
  /** The card's resource (`getResourceTarget`): a card of the same with the same service takes the frame. */
  resource: string;
  target: PlayerTarget;
  title: string;
  onClose: () => void;
  /** The player's frame (`ResourcePlayerFrame`), rendered by the host. */
  children: ReactNode;
}

/**
 * A card's player in the app's player host (`PlayerHost`): the card keeps an empty slot of the
 * frame's height, and the host lays the frame over it. While the frame is in the dock, the slot
 * keeps its height with a way back to it. Only below a `PlayerHost` (`usePlayerHost`).
 */
export function PlayerSlot({ owner, resource, target, title, onClose, children }: PlayerSlotProps) {
  const store = usePlayerHost();
  const id = useId();
  const slotRef = useRef<HTMLDivElement>(null);
  const post = useContext(PlayerFromContext);
  // The page the card is first shown on, read once the navigation that shows it has set the address.
  const page = useRef<string | null>(null);
  useLayoutEffect(() => {
    page.current ??= `${location.pathname}${location.search}`;
  }, []);

  useLayoutEffect(() => {
    store?.set(id, {
      slot: slotRef.current,
      match: `${resource}|${target.provider}`,
      owner,
      provider: target.provider,
      target,
      title,
      post,
      page: page.current ?? '/',
      onClose,
      frame: children,
    });
  });
  useLayoutEffect(() => () => store?.release(id), [store, id]);
  const view = useSyncExternalStore(
    store?.subscribe ?? noSubscribe,
    () => store?.viewOf(id) ?? '',
    () => '',
  );
  const away = view === 'away';

  return (
    <div
      ref={slotRef}
      className={cn('relative min-w-0', away && DOCK_SLOT_CLASS)}
      data-testid="player-dock-slot"
      data-docked={away ? 'true' : undefined}
      // The frame sits elsewhere in the page: assistive technology reads it here.
      aria-owns={view.startsWith('frame:') ? frameId(view.slice('frame:'.length)) : undefined}
    >
      {away && (
        <DockSlotBack
          title={title}
          onBack={() => slotRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        />
      )}
    </div>
  );
}

const noSubscribe = () => () => undefined;

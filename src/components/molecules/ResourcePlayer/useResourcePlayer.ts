'use client';

import { type RefObject, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import { onMediaStop, stopOtherMedia } from '@/hooks/useOnePlayer/useOnePlayer';
import type { PlayerProvider, PlayerTarget } from './resourcePlayer.utils';

/**
 * The one player open on the page: `{ owner, provider }`, or `null`. Opening a player anywhere
 * replaces it, so the card that held it unmounts its frame: two services can never play together,
 * whatever their APIs allow. Any other media starting on the page stops it too (`useOnePlayer`).
 * `paused`: the viewer paused it, or it ended, as far as the player tells (`useMediaBox`'s
 * `onPause`): paused in its card, it does not go to the dock (`PlayerHost`).
 */
export type ActivePlayer = { owner: string; provider: PlayerProvider; paused?: boolean } | null;

let active: ActivePlayer = null;
const listeners = new Set<() => void>();

function setActive(next: ActivePlayer) {
  if (active?.owner === next?.owner && active?.provider === next?.provider && !active?.paused === !next?.paused) {
    return;
  }
  active = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The page's player, for the app's player host (`PlayerHost`), which keeps its frame. */
export function getPagePlayer(): ActivePlayer {
  return active;
}

export function usePagePlayer(): ActivePlayer {
  return useSyncExternalStore(subscribe, getPagePlayer, () => null);
}

/** Milliseconds after which a frame that has not loaded offers the service's page instead. */
const SLOW_AFTER_MS = 12000;

export type PlayerLoadState = 'loading' | 'ready' | 'slow';

export interface ResourcePlayerState {
  /** The player open in this card, or `null` (the card shows its content). */
  current: PlayerTarget | null;
  /** The open player was paused or has ended, where its player tells (`ActivePlayer`'s `paused`). */
  paused: boolean;
  load: PlayerLoadState;
  /**
   * Open `target`'s player here, closing any other on the page and stopping any other media; `keep`
   * (the media that started it) plays on. Also its playing again after a pause.
   */
  play: (target: PlayerTarget, keep?: Element | null) => void;
  /** This card's player was paused or ended: it stays open; paused in its card, it does not dock. */
  pause: () => void;
  /** Unload this card's player and show the card again. */
  close: () => void;
  /** The frame's `load` event (the frame exists, not proof it plays). */
  onLoaded: () => void;
}

/**
 * A card's player: which of its services is open, and whether its frame has loaded. `owner` is the
 * card's place on the page (unique per rendered card); `targets` its playable services. `hosted`:
 * the app's player host keeps the frame (`PlayerHost`), so the player plays on once the card is gone.
 */
export function useResourcePlayer(
  owner: string,
  targets: PlayerTarget[],
  { hosted = false }: { hosted?: boolean } = {},
): ResourcePlayerState {
  const snapshot = usePagePlayer();
  const provider = snapshot?.owner === owner ? snapshot.provider : null;
  const current = provider ? (targets.find((target) => target.provider === provider) ?? null) : null;
  const [load, setLoad] = useState<{ key: string | null; state: PlayerLoadState }>({ key: null, state: 'loading' });
  const key = current ? `${owner}|${current.src}` : null;
  const loadState: PlayerLoadState = load.key === key ? load.state : 'loading';

  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(
      () => setLoad((prev) => (prev.key === key && prev.state === 'ready' ? prev : { key, state: 'slow' })),
      SLOW_AFTER_MS,
    );
    return () => clearTimeout(timer);
  }, [key]);

  // Set while the card unmounts, before the effect below lets go (effects clean up in order).
  const unmounting = useRef(false);
  useEffect(() => {
    unmounting.current = false;
    return () => {
      unmounting.current = true;
    };
  }, []);
  // Leaving the page unloads its player, unless the host keeps its frame; another resource in the
  // card unloads it either way. Other media starting stops it.
  useEffect(() => {
    const close = () => {
      if (active?.owner === owner) setActive(null);
    };
    const unsubscribe = onMediaStop(close);
    return () => {
      unsubscribe();
      if (!hosted || !unmounting.current) close();
    };
  }, [owner, hosted]);

  const play = (target: PlayerTarget, keep: Element | null = null) => {
    stopOtherMedia(keep);
    setActive({ owner, provider: target.provider });
  };
  const pause = () => {
    if (active?.owner === owner) setActive({ ...active, paused: true });
  };
  const close = () => {
    if (active?.owner === owner) setActive(null);
  };
  const onLoaded = () => setLoad({ key, state: 'ready' });

  return {
    current,
    paused: current !== null && snapshot?.paused === true,
    load: loadState,
    play,
    pause,
    close,
    onLoaded,
  };
}

/** How often the page looks where the focus is while it is inside a frame (`useFramePress`). */
const FOCUS_POLL_MS = 250;
/** Each enabled `useFramePress`'s look at the focus; one poll runs them all (`pollFocus`). */
const focusLooks = new Set<() => void>();
let focusPoll: ReturnType<typeof setInterval> | undefined;

function stopFocusPoll() {
  clearInterval(focusPoll);
  focusPoll = undefined;
}

/** Looks where the focus is now and then, until it leaves the frames or no one asks any more. */
function pollFocus() {
  if (focusPoll !== undefined) return;
  focusPoll = setInterval(() => {
    if (focusLooks.size === 0 || !(document.activeElement instanceof HTMLIFrameElement)) stopFocusPoll();
    else if (document.visibilityState !== 'hidden') focusLooks.forEach((look) => look());
  }, FOCUS_POLL_MS);
}

/**
 * Calls `onPress` when the viewer presses inside a frame in `box`: a press in an iframe moves the
 * focus there, which the page sees as its window's blur, or, from another frame, as a `focusin`.
 * Firefox and Safari send neither from one frame into another, so while the focus is inside a frame
 * the page also looks where it is now and then. With a hover-capable pointer it counts only with the
 * pointer over `box`, so tabbing into a frame is no press. Only while `enabled`.
 */
export function useFramePress(box: RefObject<HTMLElement | null>, onPress: () => void, enabled = true): void {
  const press = useEffectEvent(onPress);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A tap inside a cross-origin frame sends the page no mouse event, so without a hover-capable
    // pointer any focus move into the frame counts (tabbing there is rare).
    const isHoverless = window.matchMedia?.('(hover: none)').matches ?? false;
    let isPointerOver = box.current?.matches(':hover') ?? false;
    const onPointer = (event: MouseEvent) => {
      isPointerOver = event.target instanceof Node && box.current?.contains(event.target) === true;
    };
    const look = () => {
      const active = document.activeElement;
      if ((isHoverless || isPointerOver) && active instanceof HTMLIFrameElement && box.current?.contains(active)) {
        press();
      }
    };
    // Read after the event: some browsers move the focus to the iframe only once it has fired.
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(look, 0);
    };
    const onBlur = () => {
      check();
      pollFocus();
    };
    focusLooks.add(look);
    // Turned on while the focus is already inside a frame (another player started from there).
    if (document.activeElement instanceof HTMLIFrameElement) pollFocus();
    document.addEventListener('mouseover', onPointer);
    window.addEventListener('blur', onBlur);
    document.addEventListener('focusin', check);
    return () => {
      focusLooks.delete(look);
      if (focusLooks.size === 0) stopFocusPoll();
      document.removeEventListener('mouseover', onPointer);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('focusin', check);
      clearTimeout(timer);
    };
  }, [box, enabled]);
}

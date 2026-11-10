'use client';

import { type RefObject, useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';
import type { PlayerProvider, PlayerTarget } from './resourcePlayer.utils';

/**
 * The one player open on the page: `{ owner, provider }`, or `null`. Opening a player anywhere
 * replaces it, so the card that held it unmounts its frame: two services can never play together,
 * whatever their APIs allow.
 */
type ActivePlayer = { owner: string; provider: PlayerProvider } | null;

let active: ActivePlayer = null;
const listeners = new Set<() => void>();

function setActive(next: ActivePlayer) {
  active = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Milliseconds after which a frame that has not loaded offers the service's page instead. */
const SLOW_AFTER_MS = 12000;

export type PlayerLoadState = 'loading' | 'ready' | 'slow';

export interface ResourcePlayerState {
  /** The player open in this card, or `null` (the card shows its content). */
  current: PlayerTarget | null;
  load: PlayerLoadState;
  /** Open `target`'s player here, closing any other on the page. */
  play: (target: PlayerTarget) => void;
  /** Unload this card's player and show the card again. */
  close: () => void;
  /** The frame's `load` event (the frame exists, not proof it plays). */
  onLoaded: () => void;
}

/**
 * A card's player: which of its services is open, and whether its frame has loaded. `owner` is the
 * card's place on the page (unique per rendered card); `targets` its playable services.
 */
export function useResourcePlayer(owner: string, targets: PlayerTarget[]): ResourcePlayerState {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => active,
    () => null,
  );
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

  // Leaving the page (or the card unmounting for another resource) unloads its player.
  useEffect(
    () => () => {
      if (active?.owner === owner) setActive(null);
    },
    [owner],
  );

  const play = (target: PlayerTarget) => setActive({ owner, provider: target.provider });
  const close = () => {
    if (active?.owner === owner) setActive(null);
  };
  const onLoaded = () => setLoad({ key, state: 'ready' });

  return { current, load: loadState, play, close, onLoaded };
}

/**
 * Calls `onPress` when the viewer presses inside a frame in `box`: a press in an iframe moves the
 * focus there, which the page sees as its window's blur, or, from another frame, as a `focusin`.
 * It counts only with the pointer over `box`, so tabbing into a frame is no press. Only while `enabled`.
 */
export function useFramePress(box: RefObject<HTMLElement | null>, onPress: () => void, enabled = true): void {
  const press = useEffectEvent(onPress);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A tap sends the page mouse events too, so this also holds on touch screens.
    let isPointerOver = box.current?.matches(':hover') ?? false;
    const onPointer = (event: MouseEvent) => {
      isPointerOver = event.target instanceof Node && box.current?.contains(event.target) === true;
    };
    // Read after the event: some browsers move the focus to the iframe only once it has fired.
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const active = document.activeElement;
        if (isPointerOver && active instanceof HTMLIFrameElement && box.current?.contains(active)) press();
      }, 0);
    };
    document.addEventListener('mouseover', onPointer);
    window.addEventListener('blur', check);
    document.addEventListener('focusin', check);
    return () => {
      document.removeEventListener('mouseover', onPointer);
      window.removeEventListener('blur', check);
      document.removeEventListener('focusin', check);
      clearTimeout(timer);
    };
  }, [box, enabled]);
}

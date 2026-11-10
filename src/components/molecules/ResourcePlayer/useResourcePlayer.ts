'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
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

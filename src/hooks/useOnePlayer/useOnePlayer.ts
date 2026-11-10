'use client';

import { type RefObject, useEffect, useEffectEvent } from 'react';
import { getFramePlayer, listenToFrame, pauseMedia, readFrameMessage } from '@/libs/utils/mediaPlayback';

/**
 * A media box on the page (`useMediaBox`): what its media starting does instead of stopping the
 * others' (`onStart`), and how it stops when other media starts (`onStop`).
 */
export interface MediaBox {
  onStart?: (media: Element) => void;
  onStop?: () => void;
}
const boxes = new Map<Element, MediaBox>();

/** Called whenever other media is stopped (`onMediaStop`): the page's card player stops then too. */
const stopListeners = new Set<() => void>();

/**
 * What each frame (its window) last said, so that the next word counts as a start only when it is
 * one. Cleared when the frame loads anew or says it stopped.
 */
const frames = new WeakMap<object, 'playing' | 'paused'>();

/**
 * Stops every media on the page but `keep` and what is in it: native media that plays (a muted one
 * plays no sound), the players with a pause command (`pauseMedia`), and each box's `onStop`.
 */
export function stopOtherMedia(keep: Element | null): void {
  const isKept = (element: Element) => keep !== null && (keep.contains(element) || element.contains(keep));
  pauseMedia(
    document,
    (element) => isKept(element) || (element instanceof HTMLMediaElement && (element.paused || element.muted)),
  );
  for (const [box, { onStop }] of boxes) {
    if (onStop && !isKept(box)) onStop();
  }
  stopListeners.forEach((listener) => listener());
}

/** Calls `listener` whenever other media is stopped (`stopOtherMedia`); returns the unsubscribe. */
export function onMediaStop(listener: () => void): () => void {
  stopListeners.add(listener);
  return () => stopListeners.delete(listener);
}

/** `media` started: its box's `onStart` where it has one, else every other media stops. */
export function reportMediaStart(media: Element): void {
  for (const [box, { onStart }] of boxes) {
    if (onStart && box.contains(media)) return onStart(media);
  }
  stopOtherMedia(media);
}

// A muted video (a page's decoration) plays no sound: it stops nothing.
const onPlay = (event: Event) => {
  if (event.target instanceof HTMLMediaElement && !event.target.muted) reportMediaStart(event.target);
};

const onFrameLoad = (event: Event) => {
  const frame = event.target;
  if (!(frame instanceof HTMLIFrameElement)) return;
  if (frame.contentWindow) frames.delete(frame.contentWindow);
  listenToFrame(frame);
};

// Only a message from a frame on the page, from that frame's own origin, is read.
const onMessage = (event: MessageEvent) => {
  const source = event.source;
  const player = getFramePlayer(event.origin)?.player;
  if (!source || source === window || !player) return;
  const said = readFrameMessage(player, event.data);
  const was = frames.get(source);
  // A word while it plays (also a late one, once told to pause), or a paused video being sought, is
  // no start.
  const isStart =
    (said === 'play' || said === 'progress') && was !== 'playing' && !(said === 'progress' && was === 'paused');
  if (said !== 'ready' && said !== 'pause' && said !== 'stop' && !isStart) return;
  const frame = Array.from(document.querySelectorAll('iframe')).find((iframe) => iframe.contentWindow === source);
  if (!frame || getFramePlayer(frame.src)?.origin !== event.origin) return;
  if (said === 'ready') listenToFrame(frame);
  else if (said === 'pause') frames.set(source, 'paused');
  else if (said === 'stop') frames.delete(source);
  else {
    frames.set(source, 'playing');
    reportMediaStart(frame);
  }
};

let watchers = 0;

function watchMedia() {
  watchers += 1;
  if (watchers === 1) {
    document.addEventListener('play', onPlay, true);
    document.addEventListener('load', onFrameLoad, true);
    window.addEventListener('message', onMessage);
    document.querySelectorAll('iframe').forEach(listenToFrame);
  }
  return () => {
    watchers -= 1;
    if (watchers > 0) return;
    document.removeEventListener('play', onPlay, true);
    document.removeEventListener('load', onFrameLoad, true);
    window.removeEventListener('message', onMessage);
  };
}

/**
 * One media plays on the page while mounted: when any starts, every other is stopped. It starts by
 * the browser's `play` for `<audio>`/`<video>`, or by the player's own messages for YouTube, Vimeo,
 * SoundCloud and Spotify embeds (`readFrameMessage`); any other player reports its start itself.
 */
export function useOnePlayer(): void {
  useEffect(watchMedia, []);
}

/**
 * A player's box while mounted (`useOnePlayer`): its media starting calls `onStart` instead of
 * stopping the others; other media starting calls `onStop`.
 */
export function useMediaBox(box: RefObject<HTMLElement | null>, { onStart, onStop }: MediaBox): void {
  const start = useEffectEvent((media: Element) => onStart?.(media));
  const stop = useEffectEvent(() => onStop?.());
  const starts = onStart !== undefined;
  const stops = onStop !== undefined;
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    boxes.set(element, { onStart: starts ? start : undefined, onStop: stops ? stop : undefined });
    const unwatch = watchMedia();
    return () => {
      boxes.delete(element);
      unwatch();
    };
  }, [box, starts, stops]);
}

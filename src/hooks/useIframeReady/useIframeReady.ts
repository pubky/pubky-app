'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { IframeReadyCountedFrom, UseIframeReadyParams, UseIframeReadyReturn } from './useIframeReady.types';

/**
 * How long an embedded page may stay silent after its iframe's `load` event. The pages this guards
 * post a ready report as soon as they render, so one that loaded and stayed silent is an error body
 * or a proxy page (#3027).
 */
export const IFRAME_READY_AFTER_LOAD_MS = 5_000;

/**
 * How long an embedded page may take to report it rendered, counted from the start of the wait.
 * Covers a request that never fires `load` (a stalled connection), where the limit above never starts.
 */
export const IFRAME_MOUNT_TIMEOUT_MS = 20_000;

/**
 * The watchdog for an iframe whose page must say it rendered before it is shown.
 *
 * While `isWaiting` and no ready report has arrived, every `message` event goes to `isReadyMessage`;
 * the first one it accepts makes `isReady` true. Without one, `onTimeout` runs once:
 * `IFRAME_READY_AFTER_LOAD_MS` after `onLoad`, or `IFRAME_MOUNT_TIMEOUT_MS` after the wait began,
 * whichever comes first. A ready report and a timeout are exclusive: whichever lands first ends the
 * wait, even when both arrive before the next render.
 *
 * `key` identifies the page (its URL): a new key starts a fresh wait, so a ready report or a `load`
 * from the previous page never carries over. `null` means no page.
 *
 * `isReadyMessage` and `onTimeout` are read through `useEffectEvent`, so callers may pass inline
 * functions: a new identity on a re-render does not restart the timers.
 */
export function useIframeReady({
  key,
  isWaiting,
  isReadyMessage,
  onTimeout,
}: UseIframeReadyParams): UseIframeReadyReturn {
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const isReady = key !== null && readyKey === key;
  const isLoaded = key !== null && loadedKey === key;
  const isWaitingForPage = isWaiting && key !== null && !isReady;

  // The page whose wait has ended (ready report or timeout). Timers and the listener are torn down
  // only after the caller re-renders, so two of them can come due in one batch: this makes the first
  // one win, and `onTimeout` run once per page.
  const settledKeyRef = useRef<string | null>(null);

  const acceptsAsReady = useEffectEvent((event: MessageEvent) => {
    if (settledKeyRef.current === key || !isReadyMessage(event)) return false;
    settledKeyRef.current = key;
    return true;
  });
  const timeOut = useEffectEvent((countedFrom: IframeReadyCountedFrom) => {
    if (settledKeyRef.current === key) return;
    settledKeyRef.current = key;
    onTimeout(countedFrom);
  });

  // Until the page reports it rendered: listen for that report, and cap the wait from its start.
  useEffect(() => {
    if (!isWaitingForPage) return;
    // A wait (re)starts: a new page, or the same one after leaving and re-entering the wait.
    settledKeyRef.current = null;

    const onMessage = (event: MessageEvent) => {
      if (acceptsAsReady(event)) setReadyKey(key);
    };
    const timer = setTimeout(() => timeOut('mount'), IFRAME_MOUNT_TIMEOUT_MS);
    window.addEventListener('message', onMessage);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    };
  }, [isWaitingForPage, key]);

  // `load` fires for an error body too, so it only starts the short wait for the report.
  useEffect(() => {
    if (!isWaitingForPage || !isLoaded) return;
    const timer = setTimeout(() => timeOut('load'), IFRAME_READY_AFTER_LOAD_MS);
    return () => clearTimeout(timer);
  }, [isWaitingForPage, isLoaded]);

  const onLoad = () => setLoadedKey(key);

  return { isReady, onLoad };
}

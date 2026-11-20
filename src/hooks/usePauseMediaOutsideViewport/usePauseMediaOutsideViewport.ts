'use client';

import { useEffect, useState } from 'react';
import { useOnePlayer } from '@/hooks/useOnePlayer/useOnePlayer';
import { pauseMedia } from '@/libs/utils/mediaPlayback';

/** Marks a box whose media keeps playing off screen (a player moved into the dock). */
export const KEEP_PLAYING_ATTRIBUTE = 'data-keep-playing';

const isKept = (element: Element) => element.closest(`[${KEEP_PLAYING_ATTRIBUTE}]`) !== null;

/**
 * Pauses media as soon as its embed is outside the viewport.
 *
 * Native media (including the video rendered by react-tweet) is paused
 * directly. YouTube, Vimeo, SoundCloud and Spotify are paused through their
 * player APIs (`pauseMedia`). Media inside a box marked `data-keep-playing`
 * (a docked player) is left playing. It also mounts the page's one-player
 * watch (`useOnePlayer`): a post's media starting stops every other media.
 */
export const usePauseMediaOutsideViewport = () => {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useOnePlayer();

  useEffect(() => {
    if (!container) return;
    if (typeof IntersectionObserver === 'undefined') return;

    let mediaObserver: MutationObserver | null = null;
    const stopWatchingMedia = () => {
      mediaObserver?.disconnect();
      mediaObserver = null;
    };

    const viewportObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          stopWatchingMedia();
          return;
        }

        pauseMedia(container, isKept);

        // Some embeds mount their media asynchronously. Keep newly added
        // players paused until the card returns to the viewport.
        if (!mediaObserver && typeof MutationObserver !== 'undefined') {
          mediaObserver = new MutationObserver(() => pauseMedia(container, isKept));
          mediaObserver.observe(container, { childList: true, subtree: true });
        }
      },
      { threshold: 0 },
    );

    viewportObserver.observe(container);
    return () => {
      viewportObserver.disconnect();
      stopWatchingMedia();
    };
  }, [container]);

  return setContainer;
};

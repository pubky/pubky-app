'use client';

import { useEffect, useState } from 'react';

const pauseIframe = (iframe: HTMLIFrameElement) => {
  try {
    const url = new URL(iframe.src);
    const isYouTube =
      url.hostname === 'youtube.com' ||
      url.hostname.endsWith('.youtube.com') ||
      url.hostname === 'youtube-nocookie.com' ||
      url.hostname.endsWith('.youtube-nocookie.com');

    if (isYouTube) {
      iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }), url.origin);
      return;
    }

    if (url.hostname === 'player.vimeo.com') {
      iframe.contentWindow?.postMessage({ method: 'pause' }, url.origin);
    }
  } catch {
    // A malformed iframe source cannot be controlled. Leave it untouched.
  }
};

const pauseMedia = (container: HTMLElement) => {
  container.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => media.pause());
  container.querySelectorAll<HTMLIFrameElement>('iframe').forEach(pauseIframe);
};

/**
 * Pauses media as soon as its embed is outside the viewport.
 *
 * Native media (including the video rendered by react-tweet) is paused
 * directly. YouTube and Vimeo are paused through their player APIs.
 */
export const usePauseMediaOutsideViewport = () => {
  const [container, setContainer] = useState<HTMLElement | null>(null);

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

        pauseMedia(container);

        // Some embeds mount their media asynchronously. Keep newly added
        // players paused until the card returns to the viewport.
        if (!mediaObserver && typeof MutationObserver !== 'undefined') {
          mediaObserver = new MutationObserver(() => pauseMedia(container));
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

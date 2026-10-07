'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import { useViewportObserver } from '@/hooks/useViewportObserver/useViewportObserver';
import { cn } from '@/libs/utils/utils';
import type { VideoProps } from './Video.types';

const INITIAL_LOAD_RETRY_DELAYS_MS = [1_000, 2_000];

export const Video = forwardRef<HTMLVideoElement, VideoProps>(function Video(
  {
    'data-testid': dataTestId,
    className,
    src,
    controls = true,
    preload = 'metadata',
    pauseVideo,
    onError,
    ...props
  }: VideoProps,
  ref,
) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const retryCount = useRef(0);
  const [retrySource, setRetrySource] = useState<string | null>(null);
  const canObserve = typeof IntersectionObserver !== 'undefined';
  const { ref: viewportRef, isVisible } = useViewportObserver({ enabled: canObserve && retrySource === src });

  useEffect(() => {
    retryCount.current = 0;
    setRetrySource(null);
  }, [src]);

  useEffect(() => {
    if (retrySource !== src || (canObserve && !isVisible)) return;
    const video = internalRef.current;
    if (!video) return;

    const timer = setTimeout(() => {
      setRetrySource(null);
      if (!video.error || video.readyState !== HTMLMediaElement.HAVE_NOTHING) return;
      retryCount.current += 1;
      // A failed metadata request (including HTTP 429) leaves native Play
      // unable to retry. Reload this element without navigating to the post.
      video.load();
    }, INITIAL_LOAD_RETRY_DELAYS_MS[retryCount.current]);

    return () => clearTimeout(timer);
  }, [retrySource, src, canObserve, isVisible]);

  useEffect(() => {
    const videoElement = internalRef.current;

    if (pauseVideo && videoElement && !videoElement.paused) {
      videoElement.pause();
    }
  }, [pauseVideo]);

  return (
    <video
      ref={(node) => {
        internalRef.current = node;
        viewportRef(node);

        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      }}
      data-testid={dataTestId || 'video'}
      className={cn(
        'h-auto max-w-full rounded-md bg-black outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      src={src}
      controls={controls}
      preload={preload}
      onError={(event) => {
        const video = event.currentTarget;
        // Browsers can report an HTTP failure as either a network error (2)
        // or an unsupported source (4). Never reset an already decoded video.
        if (
          src &&
          !src.startsWith('blob:') &&
          !src.startsWith('data:') &&
          video.readyState === HTMLMediaElement.HAVE_NOTHING &&
          (video.error?.code === 2 || video.error?.code === 4) &&
          retryCount.current < INITIAL_LOAD_RETRY_DELAYS_MS.length
        ) {
          setRetrySource(src);
          return;
        }
        onError?.(event);
      }}
      {...props}
    />
  );
});

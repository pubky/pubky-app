'use client';

import { forwardRef, useEffect, useRef } from 'react';
import type { VideoProps } from './Video.types';
import { cn } from '@/libs/utils/utils';

export const Video = forwardRef<HTMLVideoElement, VideoProps>(function Video(
  {
    'data-testid': dataTestId,
    className,
    src,
    controls = true,
    preload = 'metadata',
    pauseVideo,
    ...props
  }: VideoProps,
  ref,
) {
  const internalRef = useRef<HTMLVideoElement>(null);

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

        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      }}
      data-testid={dataTestId || 'video'}
      className={cn('h-auto max-w-full rounded-md bg-black', className)}
      src={src}
      controls={controls}
      preload={preload}
      {...props}
    />
  );
});

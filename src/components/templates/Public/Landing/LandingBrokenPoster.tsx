'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Image } from '@/atoms/Image/Image';
import { BREAKPOINTS } from '@/config/theme';
import { cn } from '@/libs/utils/utils';

const LANDING_BROKEN_VIDEO_QUERY = `(min-width: ${BREAKPOINTS.md}px)`;

function subscribeToBreakpoint(onStoreChange: () => void) {
  const mediaQueryList = window.matchMedia(LANDING_BROKEN_VIDEO_QUERY);
  mediaQueryList.addEventListener('change', onStoreChange);

  return () => {
    mediaQueryList.removeEventListener('change', onStoreChange);
  };
}

function getBreakpointSnapshot() {
  return window.matchMedia(LANDING_BROKEN_VIDEO_QUERY).matches;
}

function getServerBreakpointSnapshot() {
  return false;
}

interface LandingBrokenPosterProps {
  alt: string;
  className: string;
  image: string;
  video: string;
}

export function LandingBrokenPoster({ alt, className, image, video }: LandingBrokenPosterProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const shouldLoadVideo = useSyncExternalStore(
    subscribeToBreakpoint,
    getBreakpointSnapshot,
    getServerBreakpointSnapshot,
  );

  useEffect(() => {
    if (!shouldLoadVideo) return;

    videoRef.current?.load();
  }, [shouldLoadVideo, video]);

  const handlePointerEnter = () => {
    const videoElement = videoRef.current;

    if (!videoElement) return;

    setIsHovered(true);
    videoElement.currentTime = 0;
    void videoElement.play();
  };

  const handlePointerLeave = () => {
    const videoElement = videoRef.current;

    setIsHovered(false);

    if (!videoElement) return;

    videoElement.pause();
    videoElement.currentTime = 0;
  };

  if (!shouldLoadVideo) {
    return <Image src={image} alt={alt} width={1516} height={1516} className={className} />;
  }

  return (
    <div className={cn('relative block overflow-hidden', className)} onPointerEnter={handlePointerEnter} onPointerLeave={handlePointerLeave}>
      <Image src={image} alt={alt} width={1516} height={1516} className="absolute inset-0 size-full object-cover" />
      <video
        ref={videoRef}
        src={video}
        preload="auto"
        muted
        playsInline
        className={cn(
          'absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-200 ease-out',
          isHovered && 'opacity-100',
        )}
        aria-hidden="true"
      />
    </div>
  );
}

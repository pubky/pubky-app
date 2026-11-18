'use client';

import { useState } from 'react';
import { useMediaQuery } from 'usehooks-ts';
import { Image } from '@/atoms/Image/Image';
import { cn } from '@/libs/utils/utils';
import { LANDING_DESKTOP_QUERY, LANDING_VIDEO_QUERY } from './LandingVideo.constants';

interface LandingBrokenPosterProps {
  alt: string;
  descriptionId: string;
  className: string;
  asset: string;
}

function LandingBrokenVideo({ src }: { src: string }) {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <video
      src={src}
      autoPlay
      muted
      playsInline
      aria-hidden="true"
      onPlaying={() => setIsPlaying(true)}
      className={cn(
        'absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-200 ease-out',
        isPlaying && 'opacity-100',
      )}
    />
  );
}

export function LandingBrokenPoster({ alt, descriptionId, className, asset }: LandingBrokenPosterProps) {
  const isDesktop = useMediaQuery(LANDING_DESKTOP_QUERY, { initializeWithValue: false });
  const canAnimate = useMediaQuery(LANDING_VIDEO_QUERY, { initializeWithValue: false });
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <div
      className={cn('relative block overflow-hidden has-focus-visible:ring-2 has-focus-visible:ring-brand', className)}
      onPointerEnter={(event) => setHovered(event.pointerType !== 'touch')}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={() => setFocused(false)}
    >
      <picture>
        <source
          srcSet={`${asset}-384.webp 384w, ${asset}.webp 758w`}
          sizes="auto, (min-width: 1280px) 341px, (min-width: 768px) 33vw, 100vw"
        />
        <Image
          src={`${asset}.webp`}
          alt={alt}
          tabIndex={isDesktop ? 0 : undefined}
          aria-describedby={isDesktop ? descriptionId : undefined}
          onFocus={(event) => setFocused(event.currentTarget.matches(':focus-visible'))}
          onBlur={() => setFocused(false)}
          loading="lazy"
          width={758}
          height={758}
          className="absolute inset-0 size-full object-cover"
        />
      </picture>
      {canAnimate && (hovered || focused) && <LandingBrokenVideo src={`${asset}.mp4`} />}
    </div>
  );
}

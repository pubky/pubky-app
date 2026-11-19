'use client';

import { useSyncExternalStore } from 'react';
import { useIntersectionObserver, useMediaQuery } from 'usehooks-ts';
import { LANDING_VIDEO_QUERY } from './LandingVideo.constants';

function subscribeToPageLoad(onLoad: () => void) {
  window.addEventListener('load', onLoad);
  return () => window.removeEventListener('load', onLoad);
}

function isPageLoaded() {
  return document.readyState === 'complete';
}

function getServerLoadState() {
  return false;
}

export function LandingVideo() {
  const canAnimate = useMediaQuery(LANDING_VIDEO_QUERY, { initializeWithValue: false });
  const pageLoaded = useSyncExternalStore(subscribeToPageLoad, isPageLoaded, getServerLoadState);
  const { ref, isIntersecting } = useIntersectionObserver({ freezeOnceVisible: true });

  return (
    <aside
      ref={canAnimate && pageLoaded ? ref : undefined}
      className="relative z-0 hidden w-full md:block md:max-w-[560px] lg:max-w-none lg:pt-20"
      aria-label="Pubky video"
    >
      <div className="aspect-video overflow-hidden rounded-md border border-border bg-background bg-cover bg-center shadow-xl shadow-black/20 md:bg-[url('/images/landing-video-poster.webp')]">
        {canAnimate && pageLoaded && isIntersecting && (
          <video
            className="block size-full object-cover"
            src="/images/landing-video.mp4"
            poster="/images/landing-video-poster.webp"
            autoPlay
            loop
            muted
            playsInline
          />
        )}
      </div>
    </aside>
  );
}

'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { BREAKPOINTS } from '@/config/theme';

const LANDING_VIDEO_QUERY = `(min-width: ${BREAKPOINTS.md}px)`;

function subscribeToBreakpoint(onStoreChange: () => void) {
  const mediaQueryList = window.matchMedia(LANDING_VIDEO_QUERY);
  mediaQueryList.addEventListener('change', onStoreChange);

  return () => {
    mediaQueryList.removeEventListener('change', onStoreChange);
  };
}

function getBreakpointSnapshot() {
  return window.matchMedia(LANDING_VIDEO_QUERY).matches;
}

function getServerBreakpointSnapshot() {
  return false;
}

export function LandingVideo() {
  const t = useTranslations('landing');
  const shouldLoadVideo = useSyncExternalStore(
    subscribeToBreakpoint,
    getBreakpointSnapshot,
    getServerBreakpointSnapshot,
  );

  if (!shouldLoadVideo) return null;

  return (
    <aside className="relative z-0 w-full max-w-[460px] md:max-w-[560px] lg:max-w-none lg:pt-20" aria-label={t('videoLabel')}>
      <div className="overflow-hidden rounded-md border border-border bg-background shadow-xl shadow-black/20">
        <video className="block aspect-video w-full object-cover" src="/pubky.mp4" autoPlay loop muted playsInline />
      </div>
    </aside>
  );
}

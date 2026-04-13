'use client';

import * as Core from '@/core';
import { TimelineFeedVariant, TIMELINE_FEED_VARIANT } from '@/config';
import { useCustomFeed } from '../useCustomFeed';
import { useIsMobile } from '../useIsMobile';

export interface FeedLayoutResolutionInput {
  requestedLayout: Core.LayoutType;
  variant: TimelineFeedVariant;
  isPhoneViewport: boolean;
}

export interface FeedLayoutResolution {
  requestedLayout: Core.LayoutType;
  effectiveLayout: Core.LayoutType;
  isVisualRequested: boolean;
  isVisualActive: boolean;
  isPhoneViewport: boolean;
}

export const VISUAL_SUPPORTED_FEED_VARIANTS = new Set<TimelineFeedVariant>([
  TIMELINE_FEED_VARIANT.HOME,
  TIMELINE_FEED_VARIANT.BOOKMARKS,
  TIMELINE_FEED_VARIANT.CUSTOM,
  TIMELINE_FEED_VARIANT.SEARCH,
]);

export function resolveFeedLayout({
  requestedLayout,
  variant,
  isPhoneViewport,
}: FeedLayoutResolutionInput): FeedLayoutResolution {
  const isVisualRequested = requestedLayout === Core.LAYOUT.VISUAL;
  const isVisualSupported = !isPhoneViewport && VISUAL_SUPPORTED_FEED_VARIANTS.has(variant);
  const effectiveLayout = isVisualRequested && !isVisualSupported ? Core.LAYOUT.COLUMNS : requestedLayout;

  return {
    requestedLayout,
    effectiveLayout,
    isVisualRequested,
    isVisualActive: effectiveLayout === Core.LAYOUT.VISUAL,
    isPhoneViewport,
  };
}

export function useFeedLayoutResolution(variant: TimelineFeedVariant): FeedLayoutResolution {
  const homeLayout = Core.useHomeStore((state) => state.layout);
  const customFeed = useCustomFeed();
  const isPhoneViewport = useIsMobile({ breakpoint: 'md' });
  const customFeedLayout =
    variant === TIMELINE_FEED_VARIANT.CUSTOM && customFeed?.layout !== undefined
      ? Core.pubkyLayoutToHomeLayout(customFeed.layout)
      : undefined;

  const requestedLayout = customFeedLayout ?? homeLayout;

  return resolveFeedLayout({
    requestedLayout,
    variant,
    isPhoneViewport,
  });
}

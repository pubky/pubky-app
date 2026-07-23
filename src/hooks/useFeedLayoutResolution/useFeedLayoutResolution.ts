'use client';

import { GRID_LAYOUT_VARIANTS, TIMELINE_FEED_VARIANT, type TimelineFeedVariant } from '@/config/feed';
import { useCustomFeed } from '@/hooks/useCustomFeed/useCustomFeed';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useHomeStore } from '@/stores/home/home.store';
import { LAYOUT, type LayoutType } from '@/stores/home/home.types';
import { pubkyLayoutToHomeLayout } from '@/utils/pubky-app-spec-feed-mappers';

export interface FeedLayoutResolutionInput {
  requestedLayout: LayoutType;
  variant: TimelineFeedVariant;
  isPhoneViewport: boolean;
}

export interface FeedLayoutResolution {
  requestedLayout: LayoutType;
  effectiveLayout: LayoutType;
  isVisualRequested: boolean;
  isVisualActive: boolean;
  /**
   * Whether this variant renders its posts in a fixed card grid (decision D5).
   * Orthogonal to `effectiveLayout` — grid is variant-driven, not a `LayoutType`.
   */
  isGridActive: boolean;
  isPhoneViewport: boolean;
}

const RICH_LAYOUT_SUPPORTED_FEED_VARIANTS = new Set<TimelineFeedVariant>([
  TIMELINE_FEED_VARIANT.HOME,
  TIMELINE_FEED_VARIANT.CUSTOM,
  TIMELINE_FEED_VARIANT.SEARCH,
]);

export function resolveFeedLayout({
  requestedLayout,
  variant,
  isPhoneViewport,
}: FeedLayoutResolutionInput): FeedLayoutResolution {
  const isVisualRequested = requestedLayout === LAYOUT.VISUAL;
  const isVisualSupported = !isPhoneViewport && RICH_LAYOUT_SUPPORTED_FEED_VARIANTS.has(variant);
  const isWideRequested = requestedLayout === LAYOUT.WIDE;
  const isListRequested = requestedLayout === LAYOUT.LIST;
  const isRichLayoutSupported = RICH_LAYOUT_SUPPORTED_FEED_VARIANTS.has(variant);
  const effectiveLayout =
    (isVisualRequested && !isVisualSupported) || ((isWideRequested || isListRequested) && !isRichLayoutSupported)
      ? LAYOUT.COLUMNS
      : requestedLayout;

  return {
    requestedLayout,
    effectiveLayout,
    isVisualRequested,
    isVisualActive: effectiveLayout === LAYOUT.VISUAL,
    isGridActive: GRID_LAYOUT_VARIANTS.has(variant),
    isPhoneViewport,
  };
}

export function useFeedLayoutResolution(variant: TimelineFeedVariant): FeedLayoutResolution {
  const homeLayout = useHomeStore((state) => state.layout);
  const customFeed = useCustomFeed();
  const isPhoneViewport = useIsMobile({ breakpoint: 'md' });
  const customFeedLayout =
    variant === TIMELINE_FEED_VARIANT.CUSTOM && customFeed?.layout !== undefined
      ? pubkyLayoutToHomeLayout(customFeed.layout)
      : undefined;

  const requestedLayout = customFeedLayout ?? homeLayout;

  return resolveFeedLayout({
    requestedLayout,
    variant,
    isPhoneViewport,
  });
}

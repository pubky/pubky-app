import { renderHook } from '@testing-library/react';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCollectionLayout } from '@/config/collections';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useCustomFeed } from '@/hooks/useCustomFeed/useCustomFeed';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useHomeStore } from '@/stores/home/home.store';
import { LAYOUT } from '@/stores/home/home.types';
import { resolveFeedLayout, useFeedLayoutResolution } from './useFeedLayoutResolution';

vi.mock('@/hooks/useCustomFeed/useCustomFeed');
vi.mock('@/hooks/useIsMobile/useIsMobile');

afterEach(() => {
  vi.resetAllMocks();
  useHomeStore.getState().reset();
});

describe('resolveFeedLayout', () => {
  it('keeps visual layout active for supported feeds on desktop/tablet', () => {
    const result = resolveFeedLayout({
      requestedLayout: LAYOUT.VISUAL,
      variant: TIMELINE_FEED_VARIANT.HOME,
      isPhoneViewport: false,
    });

    expect(result.requestedLayout).toBe(LAYOUT.VISUAL);
    expect(result.effectiveLayout).toBe(LAYOUT.VISUAL);
    expect(result.isVisualActive).toBe(true);
  });

  it('falls back to columns for visual layout on phones', () => {
    const result = resolveFeedLayout({
      requestedLayout: LAYOUT.VISUAL,
      variant: TIMELINE_FEED_VARIANT.HOME,
      isPhoneViewport: true,
    });

    expect(result.requestedLayout).toBe(LAYOUT.VISUAL);
    expect(result.effectiveLayout).toBe(LAYOUT.COLUMNS);
    expect(result.isVisualRequested).toBe(true);
    expect(result.isVisualActive).toBe(false);
  });

  // The bookmarks route has no layout filter UI; it must not adopt the shared
  // wide/visual layout. The route explicitly requests Cards.
  it.each([LAYOUT.VISUAL, LAYOUT.WIDE])(
    'falls back to columns for %s layout on the bookmarks variant (desktop)',
    (requestedLayout) => {
      const result = resolveFeedLayout({
        requestedLayout,
        variant: TIMELINE_FEED_VARIANT.BOOKMARKS,
        isPhoneViewport: false,
      });

      expect(result.requestedLayout).toBe(requestedLayout);
      expect(result.effectiveLayout).toBe(LAYOUT.COLUMNS);
      expect(result.isVisualActive).toBe(false);
    },
  );

  it('falls back to columns for unsupported feeds without mutating the requested value', () => {
    const result = resolveFeedLayout({
      requestedLayout: LAYOUT.VISUAL,
      variant: TIMELINE_FEED_VARIANT.HOT,
      isPhoneViewport: false,
    });

    expect(result.requestedLayout).toBe(LAYOUT.VISUAL);
    expect(result.effectiveLayout).toBe(LAYOUT.COLUMNS);
    expect(result.isVisualActive).toBe(false);
  });

  it('keeps visual layout active for search feed on desktop/tablet', () => {
    const result = resolveFeedLayout({
      requestedLayout: LAYOUT.VISUAL,
      variant: TIMELINE_FEED_VARIANT.SEARCH,
      isPhoneViewport: false,
    });

    expect(result.requestedLayout).toBe(LAYOUT.VISUAL);
    expect(result.effectiveLayout).toBe(LAYOUT.VISUAL);
    expect(result.isVisualActive).toBe(true);
  });

  it('keeps wide layout active for supported feeds', () => {
    const result = resolveFeedLayout({
      requestedLayout: LAYOUT.WIDE,
      variant: TIMELINE_FEED_VARIANT.HOME,
      isPhoneViewport: false,
    });

    expect(result.requestedLayout).toBe(LAYOUT.WIDE);
    expect(result.effectiveLayout).toBe(LAYOUT.WIDE);
    expect(result.isVisualRequested).toBe(false);
    expect(result.isVisualActive).toBe(false);
  });

  it('falls back to columns for wide layout on unsupported feeds without mutating the requested value', () => {
    const result = resolveFeedLayout({
      requestedLayout: LAYOUT.WIDE,
      variant: TIMELINE_FEED_VARIANT.HOT,
      isPhoneViewport: false,
    });

    expect(result.requestedLayout).toBe(LAYOUT.WIDE);
    expect(result.effectiveLayout).toBe(LAYOUT.COLUMNS);
    expect(result.isVisualRequested).toBe(false);
    expect(result.isVisualActive).toBe(false);
  });

  it('falls back to columns for wide layout on profile feeds without mutating the requested value', () => {
    const result = resolveFeedLayout({
      requestedLayout: LAYOUT.WIDE,
      variant: TIMELINE_FEED_VARIANT.PROFILE,
      isPhoneViewport: false,
    });

    expect(result.requestedLayout).toBe(LAYOUT.WIDE);
    expect(result.effectiveLayout).toBe(LAYOUT.COLUMNS);
    expect(result.isVisualRequested).toBe(false);
    expect(result.isVisualActive).toBe(false);
  });

  it('keeps list layout active for supported feeds', () => {
    const result = resolveFeedLayout({
      requestedLayout: LAYOUT.LIST,
      variant: TIMELINE_FEED_VARIANT.HOME,
      isPhoneViewport: false,
    });

    expect(result.requestedLayout).toBe(LAYOUT.LIST);
    expect(result.effectiveLayout).toBe(LAYOUT.LIST);
    expect(result.isVisualRequested).toBe(false);
    expect(result.isVisualActive).toBe(false);
  });

  it('falls back to columns for list layout on unsupported feeds without mutating the requested value', () => {
    const result = resolveFeedLayout({
      requestedLayout: LAYOUT.LIST,
      variant: TIMELINE_FEED_VARIANT.HOT,
      isPhoneViewport: false,
    });

    expect(result.requestedLayout).toBe(LAYOUT.LIST);
    expect(result.effectiveLayout).toBe(LAYOUT.COLUMNS);
    expect(result.isVisualRequested).toBe(false);
    expect(result.isVisualActive).toBe(false);
  });

  describe('collection visual layout', () => {
    it('keeps visual layout active for the collection variant on desktop/tablet', () => {
      const result = resolveFeedLayout({
        requestedLayout: LAYOUT.VISUAL,
        variant: TIMELINE_FEED_VARIANT.COLLECTION,
        isPhoneViewport: false,
      });

      expect(result.effectiveLayout).toBe(LAYOUT.VISUAL);
      expect(result.isVisualActive).toBe(true);
    });

    it('falls back to the collection Cards for visual layout on phones', () => {
      const result = resolveFeedLayout({
        requestedLayout: LAYOUT.VISUAL,
        variant: TIMELINE_FEED_VARIANT.COLLECTION,
        isPhoneViewport: true,
      });

      expect(result.requestedLayout).toBe(LAYOUT.VISUAL);
      expect(result.effectiveLayout).toBe(LAYOUT.CARDS);
      expect(result.isVisualRequested).toBe(true);
      expect(result.isVisualActive).toBe(false);
      expect(result.isCardsActive).toBe(true);
    });

    it('still does not enable wide layout for the collection variant', () => {
      const result = resolveFeedLayout({
        requestedLayout: LAYOUT.WIDE,
        variant: TIMELINE_FEED_VARIANT.COLLECTION,
        isPhoneViewport: false,
      });

      expect(result.effectiveLayout).toBe(LAYOUT.CARDS);
    });
  });
});

describe('Cards scope', () => {
  it('keeps Cards out of the persisted collection layout validator', () => {
    expect(isCollectionLayout('cards')).toBe(false);
  });
  it.each(Object.values(TIMELINE_FEED_VARIANT))(
    'supports Cards in Collections, Bookmarks, Home, Search and custom feeds: %s',
    (variant) => {
      for (const isPhoneViewport of [false, true]) {
        const result = resolveFeedLayout({ requestedLayout: 'cards', variant, isPhoneViewport });
        const supported = [
          TIMELINE_FEED_VARIANT.COLLECTION,
          TIMELINE_FEED_VARIANT.BOOKMARKS,
          TIMELINE_FEED_VARIANT.HOME,
          TIMELINE_FEED_VARIANT.SEARCH,
          TIMELINE_FEED_VARIANT.CUSTOM,
        ].some((value) => value === variant);
        expect(result.isCardsActive).toBe(supported);
        expect(result.effectiveLayout).toBe(supported ? 'cards' : LAYOUT.COLUMNS);
        expect(result.isVisualActive).toBe(false);
      }
    },
  );
});

describe('saved custom feed layout', () => {
  it.each([false, true])('uses saved Cards instead of the Home layout (phone: %s)', (isPhoneViewport) => {
    useHomeStore.getState().setLayout(LAYOUT.WIDE);
    vi.mocked(useIsMobile).mockReturnValue(isPhoneViewport);
    vi.mocked(useCustomFeed).mockReturnValue({
      id: 'cards-feed',
      name: 'Cards feed',
      tags: [],
      domain_tags: [],
      reach: PubkyAppFeedReach.All,
      sort: PubkyAppFeedSort.Recent,
      content: null,
      layout: PubkyAppFeedLayout.Cards,
      created_at: 0,
      updated_at: 0,
    });

    const { result } = renderHook(() => useFeedLayoutResolution(TIMELINE_FEED_VARIANT.CUSTOM));

    expect(result.current.effectiveLayout).toBe(LAYOUT.CARDS);
    expect(result.current.isCardsActive).toBe(true);
    expect(useHomeStore.getState().layout).toBe(LAYOUT.WIDE);
  });
});

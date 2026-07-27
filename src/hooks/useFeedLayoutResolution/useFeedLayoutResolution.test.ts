import { describe, expect, it } from 'vitest';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { LAYOUT } from '@/stores/home/home.types';
import { resolveFeedLayout } from './useFeedLayoutResolution';

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
  // wide/visual layout. It is a fixed grid (see isGridActive) rendered in columns.
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

  describe('isGridActive', () => {
    it('marks the collection variant as grid-active when Grid is requested', () => {
      const result = resolveFeedLayout({
        requestedLayout: LAYOUT.COLUMNS,
        variant: TIMELINE_FEED_VARIANT.COLLECTION,
        isPhoneViewport: false,
      });

      expect(result.isGridActive).toBe(true);
    });

    it('allows the collection variant to use the existing List renderer', () => {
      const result = resolveFeedLayout({
        requestedLayout: LAYOUT.LIST,
        variant: TIMELINE_FEED_VARIANT.COLLECTION,
        isPhoneViewport: false,
      });

      expect(result.effectiveLayout).toBe(LAYOUT.LIST);
      expect(result.isGridActive).toBe(false);
    });

    it('marks the bookmarks variant as grid-active', () => {
      const result = resolveFeedLayout({
        requestedLayout: LAYOUT.COLUMNS,
        variant: TIMELINE_FEED_VARIANT.BOOKMARKS,
        isPhoneViewport: false,
      });

      expect(result.isGridActive).toBe(true);
    });

    it.each([
      TIMELINE_FEED_VARIANT.HOME,
      TIMELINE_FEED_VARIANT.CUSTOM,
      TIMELINE_FEED_VARIANT.PROFILE,
      TIMELINE_FEED_VARIANT.PROFILE_COLLECTIONS,
      TIMELINE_FEED_VARIANT.HOT,
      TIMELINE_FEED_VARIANT.SEARCH,
    ])('does not mark the %s variant as grid-active', (variant) => {
      const result = resolveFeedLayout({
        requestedLayout: LAYOUT.COLUMNS,
        variant,
        isPhoneViewport: false,
      });

      expect(result.isGridActive).toBe(false);
    });

    it('keeps grid active independently of effectiveLayout (orthogonal to wide/visual)', () => {
      // The collection variant is not in the rich-layout set, so a VISUAL request
      // falls back to COLUMNS; grid membership must still be derived from the variant.
      const result = resolveFeedLayout({
        requestedLayout: LAYOUT.VISUAL,
        variant: TIMELINE_FEED_VARIANT.COLLECTION,
        isPhoneViewport: false,
      });

      expect(result.effectiveLayout).toBe(LAYOUT.COLUMNS);
      expect(result.isVisualActive).toBe(false);
      expect(result.isGridActive).toBe(true);
    });
  });
});

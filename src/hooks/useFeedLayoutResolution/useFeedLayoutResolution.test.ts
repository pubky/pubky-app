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
      variant: TIMELINE_FEED_VARIANT.BOOKMARKS,
      isPhoneViewport: true,
    });

    expect(result.requestedLayout).toBe(LAYOUT.VISUAL);
    expect(result.effectiveLayout).toBe(LAYOUT.COLUMNS);
    expect(result.isVisualRequested).toBe(true);
    expect(result.isVisualActive).toBe(false);
  });

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
});

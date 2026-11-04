import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markShopFrameLoaded,
  resetShopFramePresence,
  SHOP_FRAME_LOADED_AT_STORAGE_KEY,
  shopFrameLoadedAt,
} from '@/libs/shop-embed/frame-presence';

describe('Shop frame presence', () => {
  beforeEach(() => {
    resetShopFramePresence();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('is null until the Shop frame loads', () => {
    expect(shopFrameLoadedAt()).toBeNull();
  });

  it('survives a reload: a fresh module instance still sees the load time', async () => {
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    markShopFrameLoaded();
    vi.resetModules();
    const reloaded = await import('@/libs/shop-embed/frame-presence');
    expect(reloaded.shopFrameLoadedAt()).toBe(1_700_000_000_000);
  });

  it('keeps the load time for this page when localStorage refuses the write', () => {
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    markShopFrameLoaded();
    expect(shopFrameLoadedAt()).toBe(1_700_000_000_000);
  });

  it('treats an unreadable store or a malformed value as unknown', () => {
    localStorage.setItem(SHOP_FRAME_LOADED_AT_STORAGE_KEY, 'not-a-time');
    expect(shopFrameLoadedAt()).toBeNull();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(shopFrameLoadedAt()).toBeNull();
  });
});

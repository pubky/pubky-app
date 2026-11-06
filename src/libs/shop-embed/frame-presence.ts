// Diagnostics only (#2942): when the same-origin Shop frame last ran in this browser. The Shop
// shares the SDK's session database, so a lost App session report says whether it was present.
// Kept in localStorage so the reload that finds the grant missing (`restore`) and a Shop running
// in another tab both still see it; module state alone resets on every page load.
export const SHOP_FRAME_LOADED_AT_STORAGE_KEY = 'pubky-app:shop-frame-loaded-at';

// The last value written in this page, for when localStorage refuses the write.
let unsavedLoadedAt: number | null = null;

export function markShopFrameLoaded(): void {
  const now = Date.now();
  try {
    window.localStorage.setItem(SHOP_FRAME_LOADED_AT_STORAGE_KEY, String(now));
    unsavedLoadedAt = null;
  } catch {
    unsavedLoadedAt = now;
  }
}

/** Epoch milliseconds of the last Shop frame load in this browser, or null when none is known. */
export function shopFrameLoadedAt(): number | null {
  if (unsavedLoadedAt !== null) return unsavedLoadedAt;
  try {
    const stored = Number(window.localStorage.getItem(SHOP_FRAME_LOADED_AT_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

/** Test isolation only. */
export function resetShopFramePresence(): void {
  unsavedLoadedAt = null;
  try {
    window.localStorage.removeItem(SHOP_FRAME_LOADED_AT_STORAGE_KEY);
  } catch {
    // Nothing persisted to clear.
  }
}

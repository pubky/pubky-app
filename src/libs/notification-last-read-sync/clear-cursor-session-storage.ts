import { NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX } from '@/config/notification-last-read-sync';

/**
 * Drops homeserver event-stream cursors for last_read sync. Session storage survives logout until the tab closes;
 * clearing on sign-out avoids leaving per-user cursor state in an open tab.
 */
export function clearNotificationLastReadSyncCursorSessionStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    // Collect keys first: removing while iterating indices is unsafe.
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Private mode / access errors — ignore.
  }
}

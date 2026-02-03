/**
 * Utilities for the Web Share Target API integration.
 *
 * When the OS shares content to this PWA, the service worker intercepts the POST,
 * caches any shared files, and redirects to /share with query parameters.
 * These utilities help the share page retrieve the cached files and compose post content.
 */

const SHARE_TARGET_CACHE = 'share-target-files';

/**
 * Retrieve files that were cached by the service worker from a share target POST.
 * After retrieval, the cache is cleared to avoid stale data.
 */
export async function getSharedFiles(): Promise<File[]> {
  try {
    const cache = await caches.open(SHARE_TARGET_CACHE);
    const keys = await cache.keys();

    if (keys.length === 0) return [];

    const files: File[] = [];

    for (const request of keys) {
      const response = await cache.match(request);
      if (!response) continue;

      const blob = await response.blob();
      const filename = response.headers.get('X-Share-Filename') || 'shared-file';
      const contentType = response.headers.get('Content-Type') || blob.type;

      files.push(new File([blob], filename, { type: contentType }));
    }

    // Clear the cache after retrieval
    await caches.delete(SHARE_TARGET_CACHE);

    return files;
  } catch {
    return [];
  }
}

/**
 * Compose post content from share target parameters.
 *
 * Handles common sharing patterns:
 * - Link shares: title + url (from browsers, "share page" actions)
 * - Text shares: text only (from note apps, selected text)
 * - Mixed shares: text + url (from social apps, "share via" with comment)
 */
export function composeShareContent(params: { title?: string; text?: string; url?: string }): string {
  const { title, text, url } = params;
  const parts: string[] = [];

  if (text) {
    parts.push(text);
  }

  // Append URL if it's not already contained in the text
  if (url && (!text || !text.includes(url))) {
    parts.push(url);
  }

  // If we only have a title (rare), use it as content
  if (parts.length === 0 && title) {
    parts.push(title);
  }

  return parts.join('\n\n');
}

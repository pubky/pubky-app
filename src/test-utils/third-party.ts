import { expect } from 'vitest';

/**
 * Asserts that nothing under `root` loads from another origin before a press: no frame, script or
 * media element, every `[src]` (images, icons) and every inline background image on the app's own
 * origin (its `/api/image` and `/api/favicon` routes).
 */
export function expectNoThirdPartyLoads(root: ParentNode = document): void {
  expect(root.querySelectorAll('iframe, script, audio, video')).toHaveLength(0);
  const origin = window.location.origin;
  for (const node of root.querySelectorAll('[src]')) {
    expect(new URL(node.getAttribute('src') ?? '', window.location.href).origin).toBe(origin);
  }
  for (const node of root.querySelectorAll<HTMLElement>('[style]')) {
    for (const [, url] of node.style.backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      expect(new URL(url, window.location.href).origin).toBe(origin);
    }
  }
}

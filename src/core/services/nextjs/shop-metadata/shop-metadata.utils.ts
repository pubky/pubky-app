import type { TShopListingMetadata } from '@/application/shop-metadata/shop-metadata.types';
import { extractFromHtml, OG_PATTERNS } from '@/libs/html/html';

const DESCRIPTION_PATTERNS = [
  /<meta\s+(?:property|name)=["']og:description["']\s+content=["']([^"']+)["']/gi,
  /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:description["']/gi,
];

/** Shop owns the listing copy and adult/removed-item policy; App copies only its public tags. */
export function extractShopMetadata(html: string, documentUrl: URL): TShopListingMetadata | null {
  const title = extractFromHtml(html, OG_PATTERNS.TITLE);
  if (!title) return null;

  const description = extractFromHtml(html, DESCRIPTION_PATTERNS) ?? '';
  const image = extractFromHtml(html, OG_PATTERNS.IMAGE);
  return { title, description, image: image ? safeShopImage(image, documentUrl) : null };
}

function safeShopImage(image: string, documentUrl: URL): string | null {
  try {
    const url = new URL(image, documentUrl);
    // No arbitrary image destinations, credentials, or App wrapper routes. Preserve Next's cache query.
    if (
      url.origin !== documentUrl.origin ||
      url.username ||
      url.password ||
      !['opengraph-image', 'twitter-image'].some((name) => url.pathname === `${documentUrl.pathname}/${name}`)
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

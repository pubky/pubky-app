import type { MetadataRoute } from 'next';

/**
 * Serves `/robots.txt`. Without this file the path fell through to the app's
 * 404 page — a 49 KB `text/html` document with status 200 — which social
 * crawlers may consult before fetching a link preview. Static so it is emitted
 * at build time and served instantly as `text/plain`.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/' } };
}

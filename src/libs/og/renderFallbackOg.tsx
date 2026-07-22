import { getDefaultUrl, getPreviewImage } from '@/config/metadata';

/**
 * Fallback used whenever the data needed for a richer OG card is missing or an
 * error is thrown. Redirects to the app's configured default preview image
 * (`getPreviewImage()`), reusing the single canonical brand asset the rest of
 * the app already advertises.
 *
 * Deliberately redirect-based (not satori-rendered): it must stay independent of
 * the font/render pipeline so it still succeeds even when that pipeline is the
 * thing that failed. Relative preview paths are resolved against the configured
 * site URL so the emitted `Location` is always absolute.
 */
export function renderFallbackOg(): Response {
  const preview = getPreviewImage();
  const url = /^https?:\/\//.test(preview) ? preview : new URL(preview, getDefaultUrl()).toString();
  return Response.redirect(url, 307);
}

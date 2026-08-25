type AttachmentUrls = { main: string; feed?: string };

type AttachmentWithUrls = { type: string; urls: AttachmentUrls };
type AttachmentWithNullableUrls = { type: string; urls: AttachmentUrls | null };

/**
 * CDN variant for inline attachment previews: FEED (small, already warmed by
 * feed renders) for images — except GIFs, which use MAIN as a workaround:
 * Nexus's image processing partially degrades/breaks animated GIFs when
 * generating the FEED variant (backend fix pending; tracked with the Nexus
 * team). Non-image types carry no FEED variant and fall back to MAIN.
 *
 * Single source of the variant-selection rule shared by the feed grid, list
 * thumbnails, visual tiles, and the edit composer.
 */
export function getAttachmentPreviewUrl(attachment: AttachmentWithUrls): string;
export function getAttachmentPreviewUrl(attachment: AttachmentWithNullableUrls): string | null;
export function getAttachmentPreviewUrl(attachment: AttachmentWithNullableUrls): string | null {
  if (!attachment.urls) return null;
  if (attachment.type === 'image/gif') return attachment.urls.main;
  return attachment.urls.feed ?? attachment.urls.main;
}

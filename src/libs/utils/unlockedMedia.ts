import { isSvgType, rasterizeSvg } from '@/libs/image/rasterizeSvg';
import type { AttachmentConstructed, PendingAttachment } from '@/organisms/PostAttachments/PostAttachments.types';
import type { ReplicatedPost, TUnlockedAttachment } from '@/services/locks/locks.types';

/**
 * Replaces each SVG with a PNG drawing of it, and drops an SVG that cannot be drawn. An unlocked
 * file's object URL is on the app origin, so an SVG opened from it in a new tab would run its
 * scripts there (#2683). One file at a time, since each drawing holds a full-size canvas.
 */
export async function toDisplayableAttachments(attachments: TUnlockedAttachment[]): Promise<TUnlockedAttachment[]> {
  const displayable: TUnlockedAttachment[] = [];
  for (const attachment of attachments) {
    if (!isSvgType(attachment.contentType)) {
      displayable.push(attachment);
      continue;
    }
    const png = await rasterizeSvg(attachment.bytes);
    if (png) displayable.push({ ...attachment, contentType: 'image/png', bytes: png });
  }
  return displayable;
}

/**
 * Guarded attachment bytes → object-URL media, matching the creator-preview `localAttachments` shape.
 * Callers own the returned URLs and must `URL.revokeObjectURL` them once the DOM stops using them.
 * Pass `toDisplayableAttachments` output: an SVG still left here is dropped, never given a URL.
 */
export const toUnlockedMedia = (attachments: TUnlockedAttachment[]): AttachmentConstructed[] =>
  attachments
    .filter(({ contentType }) => !isSvgType(contentType))
    .map(({ contentType, bytes, slot }, index) => {
      // `bytes as BlobPart`: the SDK's `Uint8Array<ArrayBufferLike>` doesn't narrow to Blob's expected view.
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: contentType }));
      const isImage = contentType.startsWith('image');
      return {
        type: contentType,
        name: `attachment-${index}`,
        urls: { main: url, feed: isImage ? url : undefined },
        slot,
      };
    });

/** Keeps the array identity when there is nothing to clear, so an already-empty state does not re-render. */
export const clearIfFilled = <T>(current: T[]): T[] => (current.length ? [] : current);

/** What each of a cached post's attachment slots will hold, so a skeleton can take its shape. */
export function toPendingAttachments(post: ReplicatedPost): PendingAttachment[] {
  return post.attachments?.map(({ content_type, slot }, index) => ({ slot: slot ?? index, type: content_type })) ?? [];
}

/** Attachments without a recorded slot are index-aligned with the post's `attachments`. */
export function getAttachmentAtSlot<T extends { slot?: number }>(
  attachments: T[] | undefined,
  slot: number,
): T | undefined {
  return attachments?.find((attachment, index) => (attachment.slot ?? index) === slot);
}

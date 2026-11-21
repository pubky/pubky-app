import { getInlineMediaKindFromMime } from '@/libs/file/inlineMediaKind';
import { isSvgType, rasterizeSvg } from '@/libs/image/rasterizeSvg';
import type { AttachmentConstructed, PendingAttachment } from '@/organisms/PostAttachments/PostAttachments.types';
import type { ReplicatedPost, TUnlockedAttachment } from '@/services/locks/locks.types';

/**
 * The type comes from the creator's `lock.json`, and the browser reads a list such as
 * `image/png,image/svg+xml` as its last type, so a list would get an SVG past the SVG check. Null for
 * anything that is not one `type/subtype` made of RFC 6838 name characters.
 */
const toMediaType = (contentType: string): string | null => {
  const essence = contentType.split(';')[0].trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(essence) ? essence : null;
};

/**
 * Replaces each SVG with a PNG drawing of it, and passes on every other file under its bare
 * `type/subtype`. Drops an SVG that cannot be drawn and a file whose type is not one `type/subtype`.
 * An unlocked file's object URL is on the app origin, so an SVG opened from it in a new tab would run
 * its scripts there (#2683). The upload clean-up does not cover this: a lock made by another client
 * may skip it. One file at a time, since each drawing holds a full-size canvas.
 */
export async function toDisplayableAttachments(attachments: TUnlockedAttachment[]): Promise<TUnlockedAttachment[]> {
  const displayable: TUnlockedAttachment[] = [];
  for (const attachment of attachments) {
    const contentType = toMediaType(attachment.contentType);
    if (!contentType) continue;
    if (!isSvgType(contentType)) {
      displayable.push({ ...attachment, contentType });
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
 * Only the kinds a renderer shows (an image but not an SVG, a video, audio, a PDF) get a URL: the post
 * spec also allows types such as `text/html`, which would open as a page on the app origin. Pass
 * `toDisplayableAttachments` output.
 */
export const toUnlockedMedia = (attachments: TUnlockedAttachment[]): AttachmentConstructed[] =>
  attachments
    .flatMap((attachment) => {
      const contentType = toMediaType(attachment.contentType);
      return contentType && getInlineMediaKindFromMime(contentType) && !isSvgType(contentType)
        ? [{ ...attachment, contentType }]
        : [];
    })
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

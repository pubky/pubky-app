import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import type { TUnlockedAttachment } from '@/services/locks/locks.types';

/**
 * Guarded attachment bytes → object-URL media, matching the creator-preview `localAttachments` shape.
 * Callers own the returned URLs and must `URL.revokeObjectURL` them once the DOM stops using them.
 */
export const toUnlockedMedia = (attachments: TUnlockedAttachment[]): AttachmentConstructed[] =>
  attachments.map(({ contentType, bytes }, index) => {
    // `bytes as BlobPart`: the SDK's `Uint8Array<ArrayBufferLike>` doesn't narrow to Blob's expected view.
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: contentType }));
    const isImage = contentType.startsWith('image');
    return { type: contentType, name: `attachment-${index}`, urls: { main: url, feed: isImage ? url : undefined } };
  });

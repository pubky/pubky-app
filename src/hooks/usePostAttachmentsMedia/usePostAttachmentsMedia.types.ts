import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';

export interface UsePostAttachmentsMediaResult {
  /** Resolved image/video attachments for the post (local-first). Empty until resolved / on error. */
  mediaItems: AttachmentConstructed[];
}

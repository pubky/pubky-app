import type { PostDetailsModel } from '@/models/post/details/postDetails';
import type { AttachmentConstructed, PendingAttachment } from '../PostAttachments/PostAttachments.types';

export interface PostBodyProps {
  /** Body text — a normal post's `content`, or a lock teaser's `content.teaser_description`. */
  content: string;
  attachments: PostDetailsModel['attachments'];
  localAttachments: AttachmentConstructed[] | undefined;
  textClassName?: string;
  /** The web link the post embeds: previewed in place of the first link of `content`, also without text. */
  embedUrl?: string | null;
  /** Whether the link embeds show (default); off when another part of the post already shows what they would. */
  showLinkPreview?: boolean;
  /** Forwarded to `PostAttachments`. */
  mediaVariant?: 'default' | 'list';
  /** Forwarded to `PostAttachments`. */
  collapseMedia?: boolean;
  /** Forwarded to `PostAttachments`. */
  pendingAttachments?: PendingAttachment[];
}

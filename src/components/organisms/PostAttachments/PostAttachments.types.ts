import type { ReactNode } from 'react';
import type { PostDetailsModel } from '@/models/post/details/postDetails';

export type PostAttachmentsProps = {
  attachments: PostDetailsModel['attachments'];
  localAttachments: AttachmentConstructed[] | undefined;
  className?: string;
  /** Cards caption between visual media and audio/file attachments. */
  children?: ReactNode;
  mediaVariant?: 'default' | 'list' | 'cards';
  /** Unlocked content whose bytes are still downloading: a skeleton per attachment instead of the media. Default variant only. */
  pendingAttachments?: PendingAttachment[];
};

/** An unlocked attachment whose bytes have not arrived: what its slot will hold, so a skeleton can take its shape. */
export type PendingAttachment = { slot: number; type: string };

export type AttachmentConstructed = {
  type: string;
  name: string;
  width?: number;
  height?: number;
  urls: {
    main: string;
    feed?: string;
    /** CDN-backed images only: a session object URL has no derived variants. */
    large?: string;
  };
  /** Unlocked content only: position in the locked post's `attachments`. A lost file leaves a gap. */
  slot?: number;
};

export type CategorizedAttachments<T = AttachmentConstructed> = {
  imagesAndVideos: T[];
  audios: T[];
  genericFiles: T[];
};
